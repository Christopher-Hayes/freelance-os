'use client';

import { useEffect, useRef, memo } from 'react';
import * as d3 from 'd3';

interface DailyData {
  date: string;
  totalHours: number;
  apps: Record<string, number>;
}

interface Props {
  data: DailyData[];
}

const DailyActivityChart = memo(function DailyActivityChart({ data }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    // Set dimensions
    const margin = { top: 20, right: 20, bottom: 60, left: 60 };
    const width = 600 - margin.left - margin.right;
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
        date: parseDate(d.date) || new Date(),
        hours: d.totalHours,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Create scales
    const x = d3
      .scaleBand()
      .domain(sortedData.map((d) => d.date.toISOString()))
      .range([0, width])
      .padding(0.2);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(sortedData, (d) => d.hours) || 0])
      .nice()
      .range([height, 0]);

    // Add bars
    svg
      .selectAll('.bar')
      .data(sortedData)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.date.toISOString()) || 0)
      .attr('y', (d) => y(d.hours))
      .attr('width', x.bandwidth())
      .attr('height', (d) => height - y(d.hours))
      .attr('fill', '#3b82f6')
      .attr('rx', 4);

    // Add x-axis
    const formatDate = d3.timeFormat('%b %d');
    svg
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3
          .axisBottom(x)
          .tickFormat((d) => formatDate(new Date(d as string)))
          .tickValues(
            x.domain().filter((_, i) => {
              // Show fewer ticks if too many dates
              const step = Math.ceil(data.length / 10);
              return i % step === 0;
            })
          )
      )
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
      .text('Hours');

    // Style axes
    svg.selectAll('.domain').attr('class', 'stroke-gray-300 dark:stroke-gray-700');
    svg.selectAll('.tick line').attr('class', 'stroke-gray-300 dark:stroke-gray-700');
  }, [data]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        No activity data for this date range
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg ref={svgRef} className="mx-auto"></svg>
    </div>
  );
});

export default DailyActivityChart;
