import type { Hono } from "hono";

export type Bindings = Record<string, never>;

export type Variables = {
  slug: string;
  isSaasSubdomain: boolean;
};

export type App = Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>;
