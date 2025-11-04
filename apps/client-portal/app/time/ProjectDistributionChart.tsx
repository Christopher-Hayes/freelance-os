"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface ProjectData {
  projectId: number;
  projectName: string;
  totalHours: number;
  billableHours: number;
  entriesCount: number;
}

interface ProjectDistributionChartProps {
  data: ProjectData[];
}

export default function ProjectDistributionChart({
  data,
}: ProjectDistributionChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) {
      // Clear chart if no data
      if (svgRef.current) {
        d3.select(svgRef.current).selectAll("*").remove();
      }
      return;
    }

    const width = 400;
    const height = 300;
    const radius = Math.min(width, height) / 2;

    // Clear previous chart
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    // Color scale
    const color = d3
      .scaleOrdinal<string>()
      .domain(data.map((d) => d.projectName))
      .range(d3.schemeSet2);

    // Pie generator
    const pie = d3
      .pie<ProjectData>()
      .value((d) => d.totalHours)
      .sort(null);

    // Arc generator
    const arc = d3
      .arc<d3.PieArcDatum<ProjectData>>()
      .innerRadius(radius * 0.5)
      .outerRadius(radius * 0.8);

    // Label arc (for positioning labels)
    const labelArc = d3
      .arc<d3.PieArcDatum<ProjectData>>()
      .innerRadius(radius * 0.9)
      .outerRadius(radius * 0.9);

    // Draw slices
    const arcs = svg
      .selectAll("arc")
      .data(pie(data))
      .enter()
      .append("g")
      .attr("class", "arc");

    arcs
      .append("path")
      .attr("d", arc)
      .attr("fill", (d) => color(d.data.projectName))
      .attr("stroke", "white")
      .style("stroke-width", "2px");

    // Add labels
    arcs
      .append("text")
      .attr("transform", (d) => `translate(${labelArc.centroid(d)})`)
      .attr("dy", "0.35em")
      .style("text-anchor", "middle")
      .attr("class", "fill-gray-700 dark:fill-gray-300 text-xs font-medium")
      .text((d) => `${d.data.totalHours.toFixed(1)}h`);

    // Add legend
    const legend = svg
      .selectAll(".legend")
      .data(data)
      .enter()
      .append("g")
      .attr("class", "legend")
      .attr("transform", (d, i) => `translate(${radius + 20},${-radius + i * 25})`);

    legend
      .append("rect")
      .attr("width", 18)
      .attr("height", 18)
      .attr("fill", (d) => color(d.projectName));

    legend
      .append("text")
      .attr("x", 24)
      .attr("y", 9)
      .attr("dy", "0.35em")
      .attr("class", "fill-gray-700 dark:fill-gray-300 text-xs")
      .text((d) => {
        const maxLength = 20;
        return d.projectName.length > maxLength
          ? d.projectName.substring(0, maxLength) + "..."
          : d.projectName;
      });
  }, [data]);

  return (
    <div className="w-full overflow-x-auto">
      {data.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No project data available
        </div>
      ) : (
        <svg ref={svgRef} className="mx-auto"></svg>
      )}
    </div>
  );
}
