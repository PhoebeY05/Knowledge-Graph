import axios from "axios";
import { useEffect, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';

type Node = { id: string; label: string };
type GraphNode = { id: string; text: string; value: number };
type Link = { source: string; target: string; label: string };
type GraphData = { nodes: GraphNode[]; links: Link[] };

const App = () => {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight - 64 });
  const fgRef = useRef<ForceGraphMethods<NodeObject<GraphNode>, LinkObject<GraphNode, Link>> | undefined>(undefined);

  // Fetch graph data
  const fetchGraph = async () => {
    try {
      const res = await axios.get("http://localhost:8000/graph");
      const data = res.data;

      const nodes: GraphNode[] = data.nodes.map((node: Node) => ({
        id: node.label,
        text: node.label,
        value: 1,
      }));

      const links: Link[] = data.links.map((link: Link) => ({
        source: link.source,
        target: link.target,
        label: link.label,
      }));

      setGraphData({ nodes, links });
    } catch (err) {
      console.error(err);
      alert("Failed to fetch graph data");
    }
  };

  // Initial load
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setLoading(true);
      await fetchGraph();
      if (isMounted) setLoading(false);
    };
    loadData();
    return () => { isMounted = false; };
  }, []);

  // Resize handler
  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight - 64 });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
  if (!graphData.nodes.length || !fgRef.current) return;

  const fg = fgRef.current;

  // Force settings
  fg.d3Force("link")?.distance(150);
  fg.d3Force("charge")?.strength(-500);

  // Wait a short time for simulation to settle
  setTimeout(() => {
    fg.zoomToFit(40); // 40px padding
  }, 100); // 100ms is enough for initial layout
}, [graphData]);


  useEffect(() => {
    if (!graphData.nodes.length || !fgRef.current) return;

    fgRef.current.d3ReheatSimulation(); // restarts simulation so nodes move apart
  }, [graphData]);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchGraph();
    setLoading(false);
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-gray-100 to-gray-200 flex flex-col">
      <header className="p-4 bg-white shadow-md flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Knowledge Graph</h1>
        <button
          onClick={handleRefresh}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
        >
          Refresh
        </button>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-lg font-medium">
          Loading graph...
        </div>
      ) : (
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}

          // Draw nodes as circles with wrapped text
          nodeCanvasObject={(node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const label = (node as NodeObject).text || node.id;
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            // Wrap text
            const maxWidth = 100 / globalScale;
            const words = label.split(" ");
            const lines: string[] = [];
            let currentLine = "";

            words.forEach((word: string) => {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            });
            if (currentLine) lines.push(currentLine);

            // Compute radius
            const radius = Math.max(15, (lines[0].length * fontSize) / 2, (lines.length * fontSize) / 1.5);

            // Draw circle
            ctx.fillStyle = node.color || "#10b981";
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI);
            ctx.fill();

            // Draw text lines
            ctx.fillStyle = "#fff";
            lines.forEach((line, i) => {
              ctx.fillText(line, node.x ?? 0, (node.y ?? 0) + (i - lines.length / 2 + 0.5) * fontSize);
            });
          }}
          nodeLabel={(node: NodeObject) => (node as NodeObject).text || node.id}

          // Link arrows and labels
          linkDirectionalArrowLength={6}
          linkDirectionalArrowRelPos={1}
          linkLabel={(link: LinkObject) => (link as LinkObject).label}
          linkCanvasObjectMode={() => "after"}
          linkCanvasObject={(link: LinkObject, ctx: CanvasRenderingContext2D) => {
            if (!(link as LinkObject).label) return;
            const start = link.source as NodeObject;
            const end = link.target as NodeObject;

            const x = ((start.x ?? 0) + (end.x ?? 0)) / 2;
            const y = ((start.y ?? 0) + (end.y ?? 0)) / 2;

            ctx.font = `10px Sans-Serif`;
            ctx.fillStyle = "#000";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText((link as LinkObject).label, x, y);
          }}
        />
      )}
    </div>
  );
};

export default App;
