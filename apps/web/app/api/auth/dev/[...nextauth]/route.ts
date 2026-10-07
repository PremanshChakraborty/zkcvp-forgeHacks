// apps/web/app/api/auth/dev/[...nextauth]/route.ts
import { developerHandlers } from "../../../../../lib/auth/developer";

export const { GET, POST } = developerHandlers;
