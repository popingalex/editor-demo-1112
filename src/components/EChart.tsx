import { useEffect, useRef } from "react";
import * as echarts from "echarts";

export function EChart({
  option,
  height,
  onEvent,
}: {
  option: any;
  height: number;
  onEvent?: (p: any) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: "canvas" });
    inst.current = c;
    c.on("click", (p) => handler.current?.(p));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      inst.current = null;
    };
  }, []);
  useEffect(() => {
    inst.current?.setOption(option, true);
  }, [option]);
  useEffect(() => {
    inst.current?.resize();
  }, [height]);
  return <div ref={el} style={{ height, width: "100%" }} />;
}
