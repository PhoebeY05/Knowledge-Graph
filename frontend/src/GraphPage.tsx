import axios from "axios";
import { useEffect, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';

type Node = { id: string; label: string };
type GraphNode = { id: string; text: string; value: number };
type Link = { source: string; target: string; label: string };
type GraphData = { nodes: GraphNode[]; links: Link[] };

const GraphPage = () => {
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
      fg.zoomToFit(500); // 40px padding
    }, 100); // 100ms is enough for initial layout
  }, [graphData]);


  useEffect(() => {
    if (!graphData.nodes.length || !fgRef.current) return;

    fgRef.current.d3ReheatSimulation(); // restarts simulation so nodes move apart
  }, [graphData]);

  return (
    <div className="flex flex-col h-full">
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
            let longestLineWidth = 0; // Track longest line

            words.forEach((word: string) => {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              const testWidth = ctx.measureText(testLine).width;

              if (testWidth > maxWidth && currentLine) {
                lines.push(currentLine);
                longestLineWidth = Math.max(longestLineWidth, ctx.measureText(currentLine).width);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            });

            if (currentLine) {
              lines.push(currentLine);
              longestLineWidth = Math.max(longestLineWidth, ctx.measureText(currentLine).width);
            }

            // Compute radius based on longest line
            const radius = Math.max(15, longestLineWidth / 2 + 5); // +5 for padding


            // Define a palette of good contrasting colors
            const colors = [
              "#34d399", // green
              "#60a5fa", // blue
              "#fbbf24", // yellow
              "#f87171", // red
              "#a78bfa", // purple
              "#f472b6"  // pink
            ];

            // Pick a color based on node id (so it's consistent)
            const colorIndex = Math.abs(
              [...String(node.id || "")].reduce((sum, char) => sum + char.charCodeAt(0), 0)
            ) % colors.length;

            ctx.fillStyle = colors[colorIndex];

            // Draw circle
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI);
            ctx.fill();

            // Draw text lines
            ctx.fillStyle = "#000";
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

export default GraphPage;
