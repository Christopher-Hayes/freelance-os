'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface WeekData {
  week: string;
  hours: number;
}

interface Props {
  data: WeekData[];
}

export default function WeeklyTrendChart({ data }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    // Set dimensions
    const margin = { top: 20, right: 30, bottom: 60, left: 60 };
    const width = 900 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    // Create SVG
    const svg = d3
      .select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Parse dates and sort
    const parseDate = d3.timeParse('%Y-%m-%d');
    const sortedData = data
      .map((d) => ({
        date: parseDate(d.week) || new Date(),
        hours: d.hours,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Create scales
    const x = d3
      .scaleTime()
      .domain(d3.extent(sortedData, (d) => d.date) as [Date, Date])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(sortedData, (d) => d.hours) || 0])
      .nice()
      .range([height, 0]);

    // Create line generator
    const line = d3
      .line<{ date: Date; hours: number }>()
      .x((d) => x(d.date))
      .y((d) => y(d.hours))
      .curve(d3.curveMonotoneX); // Smooth curve

    // Add line path
    svg
      .append('path')
      .datum(sortedData)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 3)
      .attr('d', line);

    // Add dots
    svg
      .selectAll('.dot')
      .data(sortedData)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', (d) => x(d.date))
      .attr('cy', (d) => y(d.hours))
      .attr('r', 5)
      .attr('fill', '#3b82f6')
      .attr('stroke', 'white')
      .attr('stroke-width', 2);

    // Add x-axis
    const formatDate = d3.timeFormat('%b %d');
    svg
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat((d) => formatDate(d as Date)))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end')
      .attr('class', 'fill-gray-600 dark:fill-gray-400 text-xs');

    // Add y-axis
    svg
      .append('g')
      .call(d3.axisLeft(y).ticks(5))
      .selectAll('text')
      .attr('class', 'fill-gray-600 dark:fill-gray-400 text-xs');

    // Add y-axis label
    svg
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 0 - margin.left)
      .attr('x', 0 - height / 2)
      .attr('dy', '1em')
      .style('text-anchor', 'middle')
      .attr('class', 'fill-gray-700 dark:fill-gray-300 text-sm font-medium')
      .text('Hours per Week');

    // Style axes
    svg.selectAll('.domain').attr('class', 'stroke-gray-300 dark:stroke-gray-700');
    svg.selectAll('.tick line').attr('class', 'stroke-gray-300 dark:stroke-gray-700');

    // Add area under the line (optional, for visual appeal)
    const area = d3
      .area<{ date: Date; hours: number }>()
      .x((d) => x(d.date))
      .y0(height)
      .y1((d) => y(d.hours))
      .curve(d3.curveMonotoneX);

    svg
      .append('path')
      .datum(sortedData)
      .attr('fill', '#3b82f6')
      .attr('fill-opacity', 0.1)
      .attr('d', area);
  }, [data]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        No weekly data for this date range
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg ref={svgRef} className="mx-auto"></svg>
    </div>
  );
}
