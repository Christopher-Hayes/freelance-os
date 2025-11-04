'use client';

import { useEffect, useRef, memo } from 'react';
import * as d3 from 'd3';
import { formatAppTitle } from '@/lib/util';

interface AppData {
  app: string;
  hours: number;
}

interface Props {
  data: AppData[];
}

const TopAppsChart = memo(function TopAppsChart({ data }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    // Set dimensions
    const width = 400;
    const height = 400;
    const radius = Math.min(width, height) / 2 - 40;

    // Create SVG
    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    // Color scale
    const color = d3.scaleOrdinal(d3.schemeCategory10);

    // Create pie layout
    const pie = d3
      .pie<AppData>()
      .value((d) => d.hours)
      .sort(null);

    // Create arc generator for donut
    const arc = d3
      .arc<d3.PieArcDatum<AppData>>()
      .innerRadius(radius * 0.5) // Make it a donut
      .outerRadius(radius);

    // Create arc generator for labels
    const labelArc = d3
      .arc<d3.PieArcDatum<AppData>>()
      .innerRadius(radius * 0.7)
      .outerRadius(radius * 0.7);

    // Draw slices
    const slices = svg
      .selectAll('.arc')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'arc');

    slices
      .append('path')
      .attr('d', arc)
      .attr('fill', (d, i) => color(i.toString()))
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .style('opacity', 0.9);

    // Add labels for larger slices
    slices
      .filter((d) => {
        const percent = (d.endAngle - d.startAngle) / (2 * Math.PI);
        return percent > 0.05; // Only label slices > 5%
      })
      .append('text')
      .attr('transform', (d) => `translate(${labelArc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('class', 'fill-white text-xs font-medium')
      .each(function(d) {
        const text = d3.select(this);
        const friendlyName = formatAppTitle(d.data.app);
        const appName = friendlyName.length > 12 ? friendlyName.substring(0, 12) + '...' : friendlyName;
        const hours = `${d.data.hours.toFixed(1)} hrs`;
        
        // Add app name
        text.append('tspan')
          .attr('x', 0)
          .attr('dy', '-0.3em')
          .attr('class', 'font-semibold')
          .text(appName);
        
        // Add hours below
        text.append('tspan')
          .attr('x', 0)
          .attr('dy', '1.2em')
          .text(hours);
      });

    // Add legend
    const legend = svg
      .selectAll('.legend')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'legend')
      .attr('transform', (_, i) => `translate(${radius + 20},${-radius + i * 25})`);

    legend
      .append('rect')
      .attr('width', 18)
      .attr('height', 18)
      .attr('fill', (_, i) => color(i.toString()))
      .attr('rx', 4);

    legend
      .append('text')
      .attr('x', 24)
      .attr('y', 9)
      .attr('dy', '.35em')
      .style('fill', 'currentColor')
      .style('font-size', '12px')
      .attr('class', 'text-gray-700 dark:text-gray-300')
      .text((d) => {
        const maxLen = 15;
        const friendlyName = formatAppTitle(d.app);
        return friendlyName.length > maxLen ? friendlyName.substring(0, maxLen) + '...' : friendlyName;
      });
  }, [data]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500 dark:text-gray-400">
        No app data for this date range
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center">
      <svg ref={svgRef} className="overflow-visible"></svg>
    </div>
  );
});

export default TopAppsChart;
