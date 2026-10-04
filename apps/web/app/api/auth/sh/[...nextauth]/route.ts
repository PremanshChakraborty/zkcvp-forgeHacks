// apps/web/app/api/auth/sh/[...nextauth]/route.ts
import { stakeholderHandlers } from "../../../../../lib/auth/stakeholder";

export const { GET, POST } = stakeholderHandlers;
