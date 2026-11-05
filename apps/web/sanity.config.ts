import { defineConfig, defineField, defineType } from "sanity";
import { structureTool } from "sanity/structure";
import { presentationTool, defineLocations } from "sanity/presentation";
import { copyDefinitions } from "./src/lib/cms/definitions";
import { documents, defaultsFor, type ContentDocument, type CopySection } from "./src/lib/cms/model";
import { apiVersion, dataset, projectId } from "./src/lib/cms/client";
import { prefilledInput } from "./src/components/cms/prefilled-input";

const documentIds = Object.keys(documents) as ContentDocument[];
const sections = Object.keys(copyDefinitions) as CopySection[];

const schemaTypes = documentIds.map((id) => defineType({
  name: id,
  title: documents[id].title,
  type: "document",
  preview: { prepare: () => ({ title: documents[id].title }) },
  fields: sections.filter((section) => copyDefinitions[section].document === id).map((section) => defineField({
    name: section,
    title: copyDefinitions[section].title,
    type: "object",
    options: { collapsible: true, collapsed: false },
    description: "Edit the words here. Layout, links to application routes, screenshots, logos, icons and downloadable files are maintained in the repository. Text baked into artwork is updated with that artwork.",
    initialValue: defaultsFor(section),
    fieldsets: Array.from(new Map(Object.values(copyDefinitions[section].fields).flatMap((field) =>
      "fieldset" in field ? [[field.fieldset, { name: field.fieldset, title: field.fieldsetTitle, options: { collapsible: true, collapsed: false } }] as const] : [],
    )).values()),
    fields: Object.entries(copyDefinitions[section].fields).map(([name, field]) => {
      const kind = "kind" in field ? field.kind : undefined;
      const shared = {
        name,
        ...("fieldset" in field ? { fieldset: field.fieldset } : {}),
        title: field.title,
        description: field.value !== field.title ? `Original: ${field.value}` : undefined,
        components: { input: prefilledInput(field.value) },
      };
      if (kind === "url") return defineField({
        ...shared, type: "url",
        validation: (rule) => rule.required().uri({ scheme: ["https"] }),
      });
      if (field.multiline) return defineField({
        ...shared, type: "text", rows: 4,
        validation: (rule) => rule.required().max(20_000),
      });
      return defineField({
        ...shared, type: "string",
        validation: (rule) => kind === "email" ? rule.required().email() : rule.required().max(20_000),
      });
    }),
  })),
}));

export default defineConfig({
  name: "stubbed",
  title: "Stubbed content",
  // Studio is not mounted without a real project ID. This placeholder only
  // allows builds and local development before the account is configured.
  projectId: projectId || "unconfigured",
  dataset,
  apiVersion,
  basePath: "/dressingroom",
  plugins: [
    structureTool({
      structure: (S) => S.list().title("Website copy").items(documentIds.map((id) =>
        S.listItem().id(id).title(documents[id].title).child(S.document().schemaType(id).documentId(id)),
      )),
    }),
    presentationTool({
      previewUrl: { initial: "/", previewMode: { enable: "/api/draft-mode/enable" } },
      resolve: {
        locations: Object.fromEntries(documentIds.map((id) => [id, defineLocations({
          locations: [{ title: documents[id].title, href: documents[id].path }],
        })])),
      },
    }),
  ],
  schema: { types: schemaTypes, templates: [] },
  document: {
    newDocumentOptions: () => [],
    actions: (actions) => actions.filter(({ action }) => action !== "delete" && action !== "duplicate" && action !== "unpublish"),
  },
});
