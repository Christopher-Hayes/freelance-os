"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface WeeklyData {
  week: string;
  weekStart: string;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  entriesCount: number;
}

interface WeeklyBreakdownChartProps {
  data: WeeklyData[];
}

export default function WeeklyBreakdownChart({
  data,
}: WeeklyBreakdownChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) {
      // Clear chart if no data
      if (svgRef.current) {
        d3.select(svgRef.current).selectAll("*").remove();
      }
      return;
    }

    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const width = 600 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    // Clear previous chart
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3
      .select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Parse dates
    const parseDate = d3.timeParse("%Y-%m-%d");
    const chartData = data.map((d) => ({
      ...d,
      date: parseDate(d.week)!,
    }));

    // Scales
    const x = d3
      .scaleTime()
      .domain(d3.extent(chartData, (d) => d.date) as [Date, Date])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(chartData, (d) => d.totalHours) || 0])
      .nice()
      .range([height, 0]);

    // Line generators
    const totalLine = d3
      .line<{ date: Date; totalHours: number }>()
      .x((d) => x(d.date))
      .y((d) => y(d.totalHours));

    const billableLine = d3
      .line<{ date: Date; billableHours: number }>()
      .x((d) => x(d.date))
      .y((d) => y(d.billableHours));

    // Draw lines
    svg
      .append("path")
      .datum(chartData)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2)
      .attr("d", totalLine as any);

    svg
      .append("path")
      .datum(chartData)
      .attr("fill", "none")
      .attr("stroke", "#10b981")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5")
      .attr("d", billableLine as any);

    // Axes
    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("class", "fill-gray-600 dark:fill-gray-400");

    svg
      .append("g")
      .call(d3.axisLeft(y))
      .selectAll("text")
      .attr("class", "fill-gray-600 dark:fill-gray-400");

    // Y-axis label
    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 0 - margin.left)
      .attr("x", 0 - height / 2)
      .attr("dy", "1em")
      .style("text-anchor", "middle")
      .attr("class", "fill-gray-600 dark:fill-gray-400 text-sm")
      .text("Hours");

    // Legend
    const legend = svg
      .append("g")
      .attr("transform", `translate(${width - 120}, 0)`);

    legend
      .append("line")
      .attr("x1", 0)
      .attr("x2", 30)
      .attr("y1", 0)
      .attr("y2", 0)
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2);

    legend
      .append("text")
      .attr("x", 35)
      .attr("y", 4)
      .attr("class", "fill-gray-600 dark:fill-gray-400 text-xs")
      .text("Total");

    legend
      .append("line")
      .attr("x1", 0)
      .attr("x2", 30)
      .attr("y1", 20)
      .attr("y2", 20)
      .attr("stroke", "#10b981")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5");

    legend
      .append("text")
      .attr("x", 35)
      .attr("y", 24)
      .attr("class", "fill-gray-600 dark:fill-gray-400 text-xs")
      .text("Billable");
  }, [data]);

  return (
    <div className="w-full overflow-x-auto">
      {data.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No data available for the selected period
        </div>
      ) : (
        <svg ref={svgRef} className="mx-auto"></svg>
      )}
    </div>
  );
}
