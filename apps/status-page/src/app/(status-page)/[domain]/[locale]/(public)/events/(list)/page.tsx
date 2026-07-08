"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useQueryStates } from "nuqs";

import { EventsYearList } from "@/components/status-page/events-year-list";
import { useTRPC } from "@/lib/trpc/client";

import { searchParamsParsers } from "./search-params";

export default function Page() {
  const [{ year }, setSearchParams] = useQueryStates(searchParamsParsers);
  const { domain } = useParams<{ domain: string }>();
  const trpc = useTRPC();
  const { data: page } = useQuery(
    trpc.statusPage.get.queryOptions({ slug: domain }),
  );

  if (!page) return null;

  const { statusReports, maintenances } = page;

  return (
    <EventsYearList
      statusReports={statusReports}
      maintenances={maintenances}
      year={year}
      onYearChange={(y) => setSearchParams({ year: y })}
    />
  );
}
