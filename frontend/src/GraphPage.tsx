/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';
import { useParams } from 'react-router-dom';

type Node = { id: string; label: string };
type GraphNode = { id: string; text: string; value: number };
type Link = { source: string; target: string; label: string };
type GraphData = { nodes: GraphNode[]; links: Link[] };

const getLinkKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

// Custom collide force without d3-force
function makeCollisionForce(getRadius: (n: any) => number, strength = 0.8) {
  let nodes: any[] = [];
  function force(alpha: number) {
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      if (a.x == null || a.y == null) continue;
      const ra = getRadius(a) || 0;
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        if (b.x == null || b.y == null) continue;
        const rb = getRadius(b) || 0;

        let dx = (b.x as number) - (a.x as number);
        let dy = (b.y as number) - (a.y as number);
        let dist2 = dx * dx + dy * dy;
        if (dist2 === 0) {
          dx = (Math.random() - 0.5) * 1e-6;
          dy = (Math.random() - 0.5) * 1e-6;
          dist2 = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(dist2);
        const minDist = ra + rb;
        if (dist >= minDist) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = (minDist - dist);
        const push = overlap * strength * alpha * 0.5;

        a.vx = (a.vx || 0) - nx * push;
        a.vy = (a.vy || 0) - ny * push;
        b.vx = (b.vx || 0) + nx * push;
        b.vy = (b.vy || 0) + ny * push;
      }
    }
  }
  (force as any).initialize = (nds: any[]) => { nodes = nds || []; };
  return force as any;
}

const GraphPage = () => {
  const { title } = useParams();
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight - 64 });
  const fgRef = useRef<ForceGraphMethods<any, any> | undefined>(undefined);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [highlightedLinks, setHighlightedLinks] = useState<Set<string>>(new Set());

  // Fetch graph data
  const fetchGraph = async () => {
    try {
      const res = await axios.get("http://localhost:8000/graph/?title=" + title);
      const data = res.data;

      const nodes: GraphNode[] = data.nodes.map((node: Node) => ({
        id: node.label,
        text: node.label,
        value: 1,
      }));

      const rawLinks: Link[] = data.links.map((link: Link) => ({
        source: link.source,
        target: link.target,
        label: link.label,
      }));

      // Collapse bidirectional edges into a single undirected pair
      const pairs = new Map<string, { a: string; b: string; labels: Set<string> }>();
      for (const l of rawLinks) {
        const a0 = String(l.source);
        const b0 = String(l.target);
        const [a, b] = a0 < b0 ? [a0, b0] : [b0, a0];
        const key = `${a}|${b}`;
        const entry = pairs.get(key) ?? { a, b, labels: new Set<string>() };
        entry.labels.add(l.label);
        pairs.set(key, entry);
      }

      const links: Link[] = Array.from(pairs.values()).map(p => ({
        source: p.a,
        target: p.b,
        label: Array.from(p.labels)[0],
      }));

      setGraphData({ nodes, links });
    } catch (err) {
      console.error(err);
      alert("Failed to fetch graph data");
    }
  };

  // Search handler
  const handleSearch = (query: string) => {
  const q = query.toLowerCase().trim();

  // Clear highlights if query is empty
  if (!q) {
    setHighlightedNodes(new Set());
    setHighlightedLinks(new Set());
    return;
  }

  const matchedNodes = new Set<string>();
  const matchedLinks = new Set<string>();

  // Match nodes
  graphData.nodes.forEach((node) => {
    if (node.text.toLowerCase().includes(q)) matchedNodes.add(node.id);
  });

  // Match links if link label matches OR either source/target node matches
  graphData.links.forEach((link) => {
    if (
      link.label.toLowerCase().includes(q)
    ) {
      matchedLinks.add(link.label);
      // Also highlight the nodes on this link
      matchedNodes.add(link.source);
      matchedNodes.add(link.target);
    }
  });
  console.log(matchedLinks)
  setHighlightedNodes(matchedNodes);
  setHighlightedLinks(matchedLinks);
};


  const handleClick = useCallback((node: NodeObject) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    fgRef.current?.centerAt(x, y, 600);
    const current = fgRef.current?.zoom() ?? 1;
    const target = Math.min(4, current < 1.6 ? 2.2 : current * 1.5);
    fgRef.current?.zoom(target, 600);
  }, [fgRef]);

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

  // Apply physics
  useEffect(() => {
    if (!graphData.nodes.length || !fgRef.current) return;
    const fg: any = fgRef.current;

    const linkForce: any = fg.d3Force("link");
    if (linkForce) linkForce.distance(90).strength(1.6);

    const charge: any = fg.d3Force("charge");
    if (charge) charge.strength(-60).distanceMax(900).distanceMin(1);

    fg.d3Force("collide", makeCollisionForce((n: any) => n.collideRadiusPhysics || 18, 0.8));
    fg.d3Force("link-sep", null);
    fg.d3Force("link-repel", null);

    fg.d3ReheatSimulation();
  }, [graphData]);

  // Auto-apply search only if there’s a query
  useEffect(() => {
    handleSearch(searchQuery);
  }, [searchQuery, graphData]);

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-2 bg-gray-100 flex items-center">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search nodes or links..."
          className="border rounded px-2 py-1 w-full"
        />
        <button
          onClick={() => handleSearch(searchQuery)}
          className="ml-2 px-3 py-1 bg-blue-500 text-white rounded"
        >
          Search
        </button>
      </div>

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
          onEngineStop={() => fgRef.current?.zoomToFit(400)}

          nodeCanvasObject={(node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const label = (node as NodeObject).text || node.id;
            const BASE_FONT_PX = 12;
            const WRAP_WIDTH_PX = 50;
            const PADDING_PX = 1;
            const MIN_RADIUS_PX = 10;
            const RADIUS_SCALE = 1.25;
            const PHYSICS_COLLIDE_MAX_WORLD = 30;

            const fontSize = BASE_FONT_PX / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const maxWidth = WRAP_WIDTH_PX / globalScale;
            const words = label.split(" ");
            const lines: string[] = [];
            let currentLine = "";
            let longestLineWidth = 0;

            for (const word of words) {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              const testWidth = ctx.measureText(testLine).width;
              if (testWidth > maxWidth && currentLine) {
                lines.push(currentLine);
                longestLineWidth = Math.max(longestLineWidth, ctx.measureText(currentLine).width);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            }
            if (currentLine) {
              lines.push(currentLine);
              longestLineWidth = Math.max(longestLineWidth, ctx.measureText(currentLine).width);
            }

            const lineHeight = fontSize * 1.1;
            const textWidthWorld = Math.max(1, longestLineWidth);
            const textHeightWorld = Math.max(lineHeight, lines.length * lineHeight);
            const paddingWorld = PADDING_PX / globalScale;
            const minRadiusWorld = MIN_RADIUS_PX / globalScale;
            const requiredRadiusWorld = Math.hypot(textWidthWorld / 2, textHeightWorld / 2) + paddingWorld;
            const radius = Math.max(minRadiusWorld, requiredRadiusWorld) * RADIUS_SCALE;

            (node as any).collideRadius = radius;
            (node as any).collideRadiusPhysics = Math.min(radius, PHYSICS_COLLIDE_MAX_WORLD);

            const colors = ["#34d399", "#60a5fa", "#fbbf24", "#f87171", "#a78bfa", "#f472b6"];
            const colorIndex = Math.abs([...String(node.id || "")].reduce((s, c) => s + c.charCodeAt(0), 0)) % colors.length;

            ctx.fillStyle =
              highlightedNodes.size > 0 && highlightedNodes.has(node.id as string)
                ? "#ff0000"
                : colors[colorIndex];

            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI);
            ctx.fill();

            ctx.fillStyle = "#000";
            lines.forEach((line, i) => {
              ctx.fillText(line, node.x ?? 0, (node.y ?? 0) + (i - lines.length / 2 + 0.5) * lineHeight);
            });
          }}

          nodeLabel={(node: NodeObject) => (node as NodeObject).text || node.id}
          onNodeDragEnd={node => { node.fx = node.x; node.fy = node.y; }}
          onNodeClick={handleClick}

          linkDirectionalArrowLength={2}
          linkDirectionalArrowRelPos={0.75}
          linkLabel={(link: LinkObject) => (link as LinkObject).label}
          linkCanvasObjectMode={() => "after"}
          linkCanvasObject={(link: LinkObject, ctx: CanvasRenderingContext2D) => {
            if (!(link as LinkObject).label) return;
            const start = link.source as NodeObject;
            const end = link.target as NodeObject;

            const x = ((start.x ?? 0) + (end.x ?? 0)) * 0.5;
            const y = ((start.y ?? 0) + (end.y ?? 0)) * 0.5;

            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.fillStyle =
              highlightedLinks.size > 0 && highlightedLinks.has(link.label)
                ? "#ff0000"
                : "#000";

            ctx.font = `10px`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            ctx.lineWidth = 2;
            ctx.strokeText((link as LinkObject).label, x, y);
            ctx.fillText((link as LinkObject).label, x, y);
          }}
        />
      )}
    </div>
  );
};

export default GraphPage;
