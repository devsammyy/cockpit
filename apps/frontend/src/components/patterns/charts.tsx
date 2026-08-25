"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/patterns/empty-state";

/**
 * Themed Recharts wrappers. All colors come from the design-token chart ramp
 * so charts read identically in light and dark themes.
 */

export const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const AXIS_STYLE = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };
const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  color: "hsl(var(--popover-foreground))",
  fontSize: 12,
};

interface ChartCardProps {
  title: string;
  description?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyLabel?: string;
  height?: number;
  children: ReactNode;
  actions?: ReactNode;
}

export function ChartCard({
  title,
  description,
  isLoading,
  isEmpty,
  emptyLabel = "No data yet",
  height = 260,
  children,
  actions,
}: ChartCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton style={{ height }} />
        ) : isEmpty ? (
          <EmptyState className="border-0 py-8" title={emptyLabel} />
        ) : (
          <div style={{ height, width: "100%" }}>{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

export interface SeriesPoint {
  label: string;
  [series: string]: string | number;
}

interface TimeSeriesAreaProps {
  data: SeriesPoint[];
  series: { key: string; name?: string; color?: string }[];
  stacked?: boolean;
  valueFormatter?: (value: number) => string;
}

export function TimeSeriesArea({ data, series, stacked, valueFormatter }: TimeSeriesAreaProps) {
  return (
    <ResponsiveContainer height="100%" width="100%">
      <AreaChart data={data} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis axisLine={false} dataKey="label" tick={AXIS_STYLE} tickLine={false} />
        <YAxis
          axisLine={false}
          tick={AXIS_STYLE}
          tickFormatter={valueFormatter}
          tickLine={false}
          width={48}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value) => (valueFormatter ? valueFormatter(Number(value)) : value)}
        />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {series.map((s, index) => {
          const color = s.color ?? CHART_COLORS[index % CHART_COLORS.length];
          return (
            <Area
              dataKey={s.key}
              fill={color}
              fillOpacity={0.15}
              key={s.key}
              name={s.name ?? s.key}
              stackId={stacked ? "stack" : undefined}
              stroke={color}
              strokeWidth={2}
              type="monotone"
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface CategoryBarProps {
  data: SeriesPoint[];
  series: { key: string; name?: string; color?: string }[];
  stacked?: boolean;
  valueFormatter?: (value: number) => string;
}

export function CategoryBar({ data, series, stacked, valueFormatter }: CategoryBarProps) {
  return (
    <ResponsiveContainer height="100%" width="100%">
      <BarChart data={data} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis axisLine={false} dataKey="label" tick={AXIS_STYLE} tickLine={false} />
        <YAxis
          axisLine={false}
          tick={AXIS_STYLE}
          tickFormatter={valueFormatter}
          tickLine={false}
          width={48}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
          formatter={(value) => (valueFormatter ? valueFormatter(Number(value)) : value)}
        />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {series.map((s, index) => (
          <Bar
            dataKey={s.key}
            fill={s.color ?? CHART_COLORS[index % CHART_COLORS.length]}
            key={s.key}
            name={s.name ?? s.key}
            radius={stacked ? undefined : [3, 3, 0, 0]}
            stackId={stacked ? "stack" : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

interface DonutProps {
  data: { name: string; value: number }[];
  valueFormatter?: (value: number) => string;
}

export function Donut({ data, valueFormatter }: DonutProps) {
  return (
    <ResponsiveContainer height="100%" width="100%">
      <PieChart>
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value) => (valueFormatter ? valueFormatter(Number(value)) : value)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Pie
          data={data}
          dataKey="value"
          innerRadius="55%"
          nameKey="name"
          outerRadius="85%"
          strokeWidth={0}
        >
          {data.map((entry, index) => (
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            <Cell fill={CHART_COLORS[index % CHART_COLORS.length]} key={entry.name} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
