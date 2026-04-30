import { router } from "../trpc.js";
import { accountsRouter } from "./app/accounts.js";
import { categoriesRouter } from "./app/categories.js";
import { contactsRouter } from "./app/contacts.js";
import { filesRouter } from "./app/files.js";
import { productsRouter } from "./app/products.js";
import { projectsRouter } from "./app/projects.js";

// Phase 3 domain routers — all tenant-scoped CRUD. Future phases will add
// transactions, invoicing, purchases, crypto, and so on as the migrations land.
export const appRouter = router({
  accounts: accountsRouter,
  categories: categoriesRouter,
  contacts: contactsRouter,
  files: filesRouter,
  products: productsRouter,
  projects: projectsRouter,
});
