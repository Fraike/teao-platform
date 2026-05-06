import { useEffect, useRef } from "react";
import { Graph } from "@antv/x6";
import type { ProcessStep } from "../../data/processes";

interface Props {
  steps: ProcessStep[];
}

const NODE_W = 210;
const NODE_H = 42;
const DIAMOND_W = 170;
const DIAMOND_H = 58;
const GAP_Y = 18;
const CENTER_X = 275;
const RIGHT_X = 530;

interface NodeDef {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: string;
  label: string;
  body: Record<string, unknown>;
}

interface EdgeDef {
  source: string;
  target: string;
  labels?: string[];
  vertices?: { x: number; y: number }[];
}

function buildGraphData(steps: ProcessStep[]) {
  const nodes: NodeDef[] = [];
  const edges: EdgeDef[] = [];

  let branchIdx = -1;
  for (let i = 0; i < steps.length; i++) {
    if (/判断|是否/.test(steps[i].title)) {
      branchIdx = i;
      break;
    }
  }

  function yForIndex(i: number): number {
    let y = 10 + i * (NODE_H + GAP_Y);
    if (branchIdx >= 0 && i > branchIdx) {
      y += DIAMOND_H - NODE_H + GAP_Y;
    }
    return y;
  }

  for (let i = 0; i < steps.length; i++) {
    const isDecision = i === branchIdx;
    const isBranch = branchIdx >= 0 && i === branchIdx + 1;

    if (isDecision) {
      nodes.push({
        id: `s${i}`,
        x: CENTER_X + (NODE_W - DIAMOND_W) / 2,
        y: yForIndex(i),
        width: DIAMOND_W,
        height: DIAMOND_H,
        shape: "polygon",
        label: steps[i].title,
        body: {
          refPoints: "0,10 10,0 20,10 10,20",
          refWidth: 20,
          refHeight: 20,
          fill: "#fff7e6",
          stroke: "#faad14",
          strokeWidth: 2,
        },
      });
    } else {
      const x = isBranch ? RIGHT_X : CENTER_X;
      nodes.push({
        id: `s${i}`,
        x,
        y: yForIndex(i),
        width: NODE_W,
        height: NODE_H,
        shape: "rect",
        label: steps[i].title,
        body: {
          rx: 6,
          ry: 6,
          fill: "#f0f5ff",
          stroke: "#1677ff",
          strokeWidth: 1,
        },
      });
    }
  }

  for (let i = 0; i < steps.length - 1; i++) {
    if (i === branchIdx) {
      const diamondBottom = yForIndex(i) + DIAMOND_H;
      // Decision → YES branch (right)
      edges.push({
        source: `s${i}`,
        target: `s${i + 1}`,
        labels: ["需要"],
        vertices: [{ x: RIGHT_X + NODE_W / 2, y: diamondBottom + GAP_Y / 2 }],
      });
      // Decision → merge (skip branch, straight down)
      const mergeIdx = branchIdx + 2;
      if (mergeIdx < steps.length) {
        edges.push({
          source: `s${i}`,
          target: `s${mergeIdx}`,
          labels: ["不需要"],
        });
      }
    } else if (i === branchIdx + 1) {
      // Branch node → merge
      const mergeIdx = branchIdx + 2;
      if (mergeIdx < steps.length) {
        const branchBottom = yForIndex(i) + NODE_H;
        const mergeTop = yForIndex(mergeIdx);
        const midY = (branchBottom + mergeTop) / 2;
        edges.push({
          source: `s${i}`,
          target: `s${mergeIdx}`,
          vertices: [
            { x: RIGHT_X + NODE_W / 2, y: midY },
            { x: CENTER_X + NODE_W / 2, y: midY },
          ],
        });
      }
    } else {
      // Regular edge
      edges.push({ source: `s${i}`, target: `s${i + 1}` });
    }
  }

  const lastIdx = steps.length - 1;
  const h = yForIndex(lastIdx) + NODE_H + 20;

  return { nodes, edges, height: h };
}

export default function FlowChart({ steps }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const { nodes, edges, height } = buildGraphData(steps);

    const graph = new Graph({
      container: containerRef.current,
      width: 760,
      height,
      grid: false,
      background: { color: "transparent" },
      interacting: false,
    });

    nodes.forEach((n) => {
      graph.addNode({
        id: n.id,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        shape: n.shape,
        attrs: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          body: n.body as any,
          label: {
            text: n.label,
            fill: "#333",
            fontSize: 12,
            textAnchor: "middle",
            textVerticalAnchor: "middle",
            textWrap: {
              width: n.width - 16,
              height: n.height - 8,
              ellipsis: true,
            },
          },
        },
        ports: {
          groups: {
            top: {
              position: "top",
              attrs: { circle: { r: 3, fill: "#999", magnet: true } },
            },
            bottom: {
              position: "bottom",
              attrs: { circle: { r: 3, fill: "#999", magnet: true } },
            },
          },
          items: [
            { id: "top", group: "top" },
            { id: "bottom", group: "bottom" },
          ],
        },
      });
    });

    edges.forEach((e) => {
      graph.addEdge({
        source: { cell: e.source, port: "bottom" },
        target: { cell: e.target, port: "top" },
        vertices: e.vertices,
        router: e.vertices ? "manhattan" : "orth",
        attrs: {
          line: {
            stroke: "#bbb",
            strokeWidth: 1.5,
            targetMarker: { name: "block", width: 8, height: 6 },
          },
        },
        labels: e.labels
          ? e.labels.map((text) => ({
              position: { distance: 0.5 },
              attrs: {
                text: { text, fill: "#1677ff", fontSize: 11 },
                rect: {
                  fill: "#e6f4ff",
                  rx: 3,
                  ry: 3,
                  refWidth: "140%",
                  refHeight: "140%",
                  refX: -6,
                  refY: -2,
                },
              },
            }))
          : undefined,
      });
    });

    graph.zoomToFit({ padding: 16, maxScale: 1 });

    return () => graph.dispose();
  }, [steps]);

  return (
    <div
      ref={containerRef}
      style={{ background: "#fafafa", borderRadius: 8, overflow: "hidden" }}
    />
  );
}
