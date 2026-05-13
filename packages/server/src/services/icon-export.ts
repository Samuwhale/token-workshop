import {
  normalizeIconSvgText,
  type IconRegistryFile,
  type ManagedIcon,
} from "@token-workshop/core";

export interface IconExportSource {
  icon: ManagedIcon;
  svgContent: string;
}

export interface IconExportFile {
  path: string;
  content: string;
}

export interface IconExportBundle {
  fileName: string;
  files: IconExportFile[];
  summary: {
    exportedIconCount: number;
    skippedIconCount: number;
  };
}

interface IconExportManifest {
  generatedAt: string;
  settings: IconRegistryFile["settings"];
  summary: {
    iconCount: number;
    exportedIconCount: number;
    skippedIconCount: number;
    publicIconCount: number;
    attributionRequiredIconCount: number;
  };
  icons: IconExportManifestIcon[];
  skipped: IconExportSkippedIcon[];
}

interface IconExportManifestIcon {
  id: string;
  name: string;
  path: string;
  componentName: string;
  status: ManagedIcon["status"];
  tags: string[];
  source: ManagedIcon["source"];
  figma: ManagedIcon["figma"];
  code: {
    exportName: string;
    rawSvgPath: string;
    svgPath: string;
    reactPath: string;
  };
  svg: {
    viewBox: string;
    width: number;
    height: number;
    hash: string;
    colorBehavior: ManagedIcon["svg"]["color"]["behavior"];
  };
  quality: ManagedIcon["quality"];
}

interface IconExportSkippedIcon {
  id: string;
  name: string;
  path: string;
  status: ManagedIcon["status"];
  qualityState: ManagedIcon["quality"]["state"];
  reason: string;
}

export function buildIconExportBundle(
  registry: IconRegistryFile,
  sources: IconExportSource[],
  generatedAt = new Date(),
): IconExportBundle {
  assertUniqueExportNames(sources.map(({ icon }) => icon));

  const generatedAtIso = generatedAt.toISOString();
  const files: IconExportFile[] = [];
  const manifestIcons: IconExportManifestIcon[] = [];

  for (const { icon, svgContent } of sources) {
    const rawSvgPath = iconSvgPath("raw-svg", icon);
    const svgPath = iconSvgPath("svg", icon);
    const reactPath = reactComponentPath(icon);
    const rawSvg = normalizeIconSvgText(svgContent);
    const normalizedSvg = normalizeSvgForDeveloperExport(icon, rawSvg);

    files.push({ path: rawSvgPath, content: rawSvg });
    files.push({ path: svgPath, content: normalizedSvg });
    files.push({
      path: reactPath,
      content: renderReactIconComponent(icon, normalizedSvg),
    });

    manifestIcons.push({
      id: icon.id,
      name: icon.name,
      path: icon.path,
      componentName: icon.componentName,
      status: icon.status,
      tags: icon.tags ?? [],
      source: icon.source,
      figma: icon.figma,
      code: {
        exportName: icon.code.exportName,
        rawSvgPath,
        svgPath,
        reactPath,
      },
      svg: {
        viewBox: icon.svg.viewBox,
        width: icon.svg.viewBoxWidth,
        height: icon.svg.viewBoxHeight,
        hash: icon.svg.hash,
        colorBehavior: icon.svg.color.behavior,
      },
      quality: icon.quality,
    });
  }

  const skipped = registry.icons
    .filter((icon) => !sources.some((source) => source.icon.id === icon.id))
    .map(iconSkippedManifestEntry)
    .sort((left, right) => left.path.localeCompare(right.path));
  const publicIcons = manifestIcons.filter(
    (icon) => icon.source.kind === "public-library",
  );
  const attributionRequiredIconCount = publicIcons.filter(
    (icon) =>
      icon.source.kind === "public-library" &&
      icon.source.license.attributionRequired,
  ).length;
  const manifest: IconExportManifest = {
    generatedAt: generatedAtIso,
    settings: registry.settings,
    summary: {
      iconCount: registry.icons.length,
      exportedIconCount: manifestIcons.length,
      skippedIconCount: skipped.length,
      publicIconCount: publicIcons.length,
      attributionRequiredIconCount,
    },
    icons: manifestIcons.sort((left, right) => left.path.localeCompare(right.path)),
    skipped,
  };

  files.push({
    path: "manifest.json",
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  });
  files.push({
    path: "attribution.json",
    content: `${JSON.stringify(buildExportAttributionManifest(manifest), null, 2)}\n`,
  });
  files.push({
    path: "index.ts",
    content: renderIconIndex(manifest.icons),
  });

  return {
    fileName: "token-workshop-icons.zip",
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    summary: {
      exportedIconCount: manifest.summary.exportedIconCount,
      skippedIconCount: manifest.summary.skippedIconCount,
    },
  };
}

export function isIconExportable(icon: ManagedIcon): boolean {
  return icon.status !== "deprecated" &&
    icon.status !== "blocked" &&
    icon.quality.state !== "blocked";
}

function iconSkippedManifestEntry(icon: ManagedIcon): IconExportSkippedIcon {
  return {
    id: icon.id,
    name: icon.name,
    path: icon.path,
    status: icon.status,
    qualityState: icon.quality.state,
    reason:
      icon.status === "deprecated"
        ? "Deprecated icons are reported but not emitted as active handoff assets."
        : "Blocked icons are reported but not emitted until quality issues are resolved.",
  };
}

function iconSvgPath(root: "raw-svg" | "svg", icon: ManagedIcon): string {
  return `${root}/${icon.path.split(".").join("/")}.svg`;
}

function reactComponentPath(icon: ManagedIcon): string {
  return `react/${icon.code.exportName}.tsx`;
}

function assertUniqueExportNames(icons: ManagedIcon[]): void {
  const exportNames = new Map<string, ManagedIcon>();
  for (const icon of icons) {
    const existing = exportNames.get(icon.code.exportName);
    if (existing) {
      throw new Error(
        `Icon export name "${icon.code.exportName}" is used by both "${existing.path}" and "${icon.path}". Rename one icon before exporting.`,
      );
    }
    exportNames.set(icon.code.exportName, icon);
  }
}

function normalizeSvgForDeveloperExport(icon: ManagedIcon, svg: string): string {
  if (
    icon.svg.color.behavior !== "inheritable" &&
    icon.svg.color.behavior !== "hardcoded-monotone"
  ) {
    return svg.endsWith("\n") ? svg : `${svg}\n`;
  }

  // Keep monotone developer exports themeable while preserving intentional
  // empty paints and paint servers.
  const withCurrentColorPaints = svg
    .replace(/\s(fill|stroke)=(")(?!none\b|currentColor\b|currentcolor\b|url\()[^"]*"/gi, ' $1="currentColor"')
    .replace(/\s(fill|stroke)=(')(?!none\b|currentColor\b|currentcolor\b|url\()[^']*'/gi, " $1='currentColor'")
    .replace(
      /(style=["'][^"']*)(fill|stroke)\s*:\s*(?!none\b|currentColor\b|currentcolor\b|url\()[^;"']+/gi,
      "$1$2:currentColor",
    );

  if (/(?:\sfill=|\sstroke=|fill\s*:|stroke\s*:)/i.test(withCurrentColorPaints)) {
    return withCurrentColorPaints.endsWith("\n")
      ? withCurrentColorPaints
      : `${withCurrentColorPaints}\n`;
  }

  return addSvgRootAttribute(withCurrentColorPaints, "fill", "currentColor");
}

function addSvgRootAttribute(svg: string, name: string, value: string): string {
  const match = /<svg(?=[\s>/])/.exec(svg);
  if (!match) {
    return svg.endsWith("\n") ? svg : `${svg}\n`;
  }
  const insertAt = match.index + match[0].length;
  const next = `${svg.slice(0, insertAt)} ${name}="${value}"${svg.slice(insertAt)}`;
  return next.endsWith("\n") ? next : `${next}\n`;
}

function renderReactIconComponent(icon: ManagedIcon, svg: string): string {
  const body = readSvgBody(svg);
  const componentName = icon.code.exportName;
  const defaultColor = icon.svg.color.behavior === "multicolor"
    ? ""
    : ' fill="currentColor"';

  return `import * as React from "react";

export interface ${componentName}Props extends React.SVGProps<SVGSVGElement> {
  title?: string;
}

const iconBody = ${JSON.stringify(body)};

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function ${componentName}({ title, ...props }: ${componentName}Props) {
  const titleMarkup = title ? \`<title>\${escapeSvgText(title)}</title>\` : "";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox=${JSON.stringify(icon.svg.viewBox)}${defaultColor}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...props}
      dangerouslySetInnerHTML={{ __html: \`\${titleMarkup}\${iconBody}\` }}
    />
  );
}

export default ${componentName};
`;
}

function readSvgBody(svg: string): string {
  const openTag = /<svg(?=[\s>/])[^>]*>/i.exec(svg);
  const closeTag = /<\/svg\s*>\s*$/i.exec(svg.trim());
  if (!openTag || !closeTag) {
    throw new Error("SVG content must have an <svg> root before React export.");
  }
  return svg.slice(openTag.index + openTag[0].length, closeTag.index).trim();
}

function renderIconIndex(icons: IconExportManifestIcon[]): string {
  const iconNames = icons.map((icon) => icon.path);
  const exports = icons.map((icon) => {
    const modulePath = `./${icon.code.reactPath.replace(/\.tsx$/, "")}`;
    return `export { ${icon.code.exportName} } from ${JSON.stringify(modulePath)};`;
  });
  const imports = icons.map(
    (icon) => `import { ${icon.code.exportName} } from ${JSON.stringify(`./${icon.code.reactPath.replace(/\.tsx$/, "")}`)};`,
  );
  const iconMapEntries = icons.map(
    (icon) => `  ${JSON.stringify(icon.path)}: ${icon.code.exportName},`,
  );

  return `import type * as React from "react";
${imports.join("\n")}

${exports.join("\n")}
export const iconNames = ${JSON.stringify(iconNames, null, 2)} as const;
export type IconName = typeof iconNames[number];

export const icons = {
${iconMapEntries.join("\n")}
} satisfies Record<IconName, React.ComponentType<React.SVGProps<SVGSVGElement> & { title?: string }>>;
`;
}

function buildExportAttributionManifest(manifest: IconExportManifest): unknown {
  const publicIcons = manifest.icons.filter(
    (icon) => icon.source.kind === "public-library",
  );

  return {
    generatedAt: manifest.generatedAt,
    summary: {
      publicIconCount: manifest.summary.publicIconCount,
      attributionRequiredIconCount:
        manifest.summary.attributionRequiredIconCount,
    },
    icons: publicIcons.map((icon) => {
      if (icon.source.kind !== "public-library") {
        throw new Error("Expected public icon source.");
      }
      return {
        id: icon.id,
        name: icon.name,
        path: icon.path,
        sourceUrl: icon.source.sourceUrl,
        providerName: icon.source.providerName,
        collectionName: icon.source.collectionName,
        license: icon.source.license,
      };
    }),
  };
}
