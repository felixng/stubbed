import { defineArrayMember, defineConfig, defineField, defineType } from "sanity";
import { structureTool } from "sanity/structure";
import { presentationTool, defineLocations } from "sanity/presentation";
import { copyDefinitions } from "./src/lib/cms/definitions";
import { documents, defaultsFor, type ContentDocument, type CopySection } from "./src/lib/cms/model";
import { apiVersion, dataset, projectId } from "./src/lib/cms/client";
import { prefilledInput, prefilledSections } from "./src/components/cms/prefilled-input";
import { aboutDefaultSections } from "./src/lib/cms/sections";
import { LEGAL } from "./src/lib/legal";

const documentIds = Object.keys(documents) as ContentDocument[];
const sections = Object.keys(copyDefinitions) as CopySection[];

// Pages edited as a list of sections instead of fixed fields.
const sectionPages: Partial<Record<ContentDocument, { legacy: CopySection; defaults: () => unknown[] }>> = {
  aboutPage: {
    legacy: "about",
    defaults: () => aboutDefaultSections(undefined, LEGAL.email).map((section) => ({
      _type: "pageSection",
      ...section,
      buttons: section.buttons.map((button) => ({ _type: "pageButton", ...button })),
    })),
  },
};

const linkProblem = (value: unknown) =>
  typeof value === "string" && (/^\/(?![/\\])\S*$/.test(value) || /^https:\/\/[^\s@]+$/.test(value) || /^mailto:[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(value)) ? true : "Use /path, https://… or mailto:…";

const linkAnnotation = {
  name: "link", type: "object", title: "Link",
  fields: [defineField({
    name: "href", type: "string", title: "Link",
    description: "A page on this site (such as /faq), a full https:// address, or mailto:name@example.com.",
    validation: (rule) => rule.required().custom(linkProblem),
  })],
};

function sectionsField(page: { legacy: CopySection; defaults: () => unknown[] }) {
  return defineField({
    name: "sections",
    title: "Page sections",
    type: "array",
    description: "The page, top to bottom. Add, remove and drag sections to reorder. A section without a heading is plain text, handy for an opening paragraph.",
    components: { input: prefilledSections(page.defaults()) },
    of: [defineArrayMember({
      name: "pageSection", type: "object", title: "Section",
      preview: { select: { title: "heading", blocks: "body" }, prepare: ({ title, blocks }: { title?: string; blocks?: { children?: { text?: string }[] }[] }) => ({
        title: title || "(no heading)",
        subtitle: blocks?.[0]?.children?.map((child) => child.text).join("").slice(0, 80),
      }) },
      fields: [
        defineField({ name: "heading", title: "Heading", type: "string", validation: (rule) => rule.max(500) }),
        defineField({ name: "divider", title: "Line above this section", type: "boolean", initialValue: false }),
        defineField({
          name: "body", title: "Text", type: "array",
          of: [defineArrayMember({
            type: "block",
            styles: [{ title: "Paragraph", value: "normal" }, { title: "Subheading", value: "h3" }],
            lists: [{ title: "Bullets", value: "bullet" }, { title: "Numbers", value: "number" }],
            marks: { decorators: [{ title: "Bold", value: "strong" }, { title: "Italic", value: "em" }], annotations: [linkAnnotation] },
          })],
        }),
        defineField({
          name: "buttons", title: "Buttons", type: "array",
          of: [defineArrayMember({
            name: "pageButton", type: "object", title: "Button",
            preview: { select: { title: "label", subtitle: "href" } },
            fields: [
              defineField({ name: "label", title: "Label", type: "string", validation: (rule) => rule.required().max(200) }),
              defineField({ name: "href", title: "Link", type: "string", description: "/signup, https://…, or mailto:…", validation: (rule) => rule.required().custom(linkProblem) }),
              defineField({ name: "variant", title: "Style", type: "string", options: { list: [{ title: "Solid", value: "primary" }, { title: "Outline", value: "ghost" }], layout: "radio" }, initialValue: "primary" }),
            ],
          })],
        }),
      ],
    })],
  });
}

const schemaTypes = documentIds.map((id) => defineType({
  name: id,
  title: documents[id].title,
  type: "document",
  preview: { prepare: () => ({ title: documents[id].title }) },
  fields: [
    ...(sectionPages[id] ? [sectionsField(sectionPages[id]!)] : []),
    ...sections.filter((section) => copyDefinitions[section].document === id).map((section) => defineField({
    name: section,
    // Replaced by page sections; kept so earlier edits are not orphaned.
    hidden: sectionPages[id]?.legacy === section,
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
        validation: (rule) => rule.max(20_000),
      });
      return defineField({
        ...shared, type: "string",
        validation: (rule) => kind === "email" ? rule.required().email() : rule.max(20_000),
      });
    }),
  }))],
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
