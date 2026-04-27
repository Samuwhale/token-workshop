import type {
  BorderRadiusScaleConfig,
  ColorRampConfig,
  CustomScaleConfig,
  GeneratorConfig,
  GeneratorTemplate,
  GeneratorType,
  OpacityScaleConfig,
  ShadowScaleConfig,
  SpacingScaleConfig,
  TypeScaleConfig,
  ZIndexScaleConfig,
} from "../shared/graphTemplateTypes";
import { cloneValue } from "../../shared/clone";

export interface SemanticStarter {
  prefix: string;
  mappings: Array<{ semantic: string; step: string }>;
  patternId?: string | null;
}

export interface GraphTemplate extends GeneratorTemplate {
  whenToUse: string;
  stages: string[];
  starterPresetName: string;
  starterPreset: string;
  sourceRequirement: string;
  sourceTokenTypes?: string[];
  semanticStarter?: SemanticStarter;
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  {
    id: "brand-color-palette",
    label: "Brand color palette",
    description: "Turn one brand color into a usable 11-step palette.",
    whenToUse:
      "Use when you need a core brand scale for UI states, fills, and accents without hand-tuning every shade.",
    stages: ["Goal", "Base color", "11-step palette", "Action aliases"],
    starterPresetName: "Balanced brand ramp",
    starterPreset: "11-step ramp with action.default, hover, active, and disabled starters.",
    sourceRequirement: "Best with a color token or hex value.",
    sourceTokenTypes: ["color"],
    defaultPrefix: "brand",
    generatorType: "colorRamp",
    requiresSource: true,
    config: {
      steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
      lightEnd: 97,
      darkEnd: 8,
      chromaBoost: 1.0,
      includeSource: false,
    } satisfies ColorRampConfig,
    semanticStarter: {
      prefix: "semantic",
      mappings: [
        { semantic: "action.default", step: "500" },
        { semantic: "action.hover", step: "600" },
        { semantic: "action.active", step: "700" },
        { semantic: "action.disabled", step: "300" },
      ],
    },
  },
  {
    id: "spacing-foundation",
    label: "Spacing foundation",
    description: "Generate a spacing ladder from one base unit.",
    whenToUse:
      "Use when you want layout spacing, padding, and gaps to stay proportional across components and pages.",
    stages: ["Goal", "Base unit", "Spacing ladder", "Component spacing"],
    starterPresetName: "Product spacing starter",
    starterPreset: "Tailwind-style spacing scale plus component.padding and component.gap starters.",
    sourceRequirement: "Best with a dimension token such as 4px or 8px.",
    sourceTokenTypes: ["dimension"],
    defaultPrefix: "spacing",
    generatorType: "spacingScale",
    requiresSource: true,
    config: {
      steps: [
        { name: "1", multiplier: 1 },
        { name: "2", multiplier: 2 },
        { name: "3", multiplier: 3 },
        { name: "4", multiplier: 4 },
        { name: "5", multiplier: 5 },
        { name: "6", multiplier: 6 },
        { name: "8", multiplier: 8 },
        { name: "10", multiplier: 10 },
        { name: "12", multiplier: 12 },
        { name: "16", multiplier: 16 },
        { name: "20", multiplier: 20 },
        { name: "24", multiplier: 24 },
      ],
      unit: "px",
    } satisfies SpacingScaleConfig,
    semanticStarter: {
      prefix: "component",
      mappings: [
        { semantic: "padding.sm", step: "2" },
        { semantic: "padding.md", step: "4" },
        { semantic: "padding.lg", step: "6" },
        { semantic: "gap.sm", step: "2" },
        { semantic: "gap.md", step: "4" },
      ],
    },
  },
  {
    id: "type-scale",
    label: "Type scale",
    description: "Create a modular font-size progression from one base size.",
    whenToUse:
      "Use when body copy and headings need a predictable rhythm instead of individually-picked sizes.",
    stages: ["Goal", "Base size", "Ratio", "xs to 3xl scale"],
    starterPresetName: "4:3 text starter",
    starterPreset: "4:3 modular scale with xs, sm, base, lg, xl, 2xl, and 3xl steps.",
    sourceRequirement: "Best with a font-size or dimension token such as 16px or 1rem.",
    sourceTokenTypes: ["fontSize", "dimension"],
    defaultPrefix: "fontSize",
    generatorType: "typeScale",
    requiresSource: true,
    config: {
      steps: [
        { name: "xs", exponent: -2 },
        { name: "sm", exponent: -1 },
        { name: "base", exponent: 0 },
        { name: "lg", exponent: 1 },
        { name: "xl", exponent: 2 },
        { name: "2xl", exponent: 3 },
        { name: "3xl", exponent: 4 },
      ],
      ratio: 1.333,
      unit: "rem",
      baseStep: "base",
      roundTo: 3,
    } satisfies TypeScaleConfig,
  },
  {
    id: "corner-radius",
    label: "Corner radius scale",
    description: "Build a small-to-full radius system from one starting value.",
    whenToUse:
      "Use when cards, inputs, buttons, and containers should share a consistent rounding language.",
    stages: ["Goal", "Base radius", "none to full scale"],
    starterPresetName: "Interface radius starter",
    starterPreset: "none, sm, md, lg, xl, 2xl, and full radius steps.",
    sourceRequirement: "Best with a dimension token such as 4px or 8px.",
    sourceTokenTypes: ["dimension"],
    defaultPrefix: "borderRadius",
    generatorType: "borderRadiusScale",
    requiresSource: true,
    config: {
      steps: [
        { name: "none", multiplier: 0, exactValue: 0 },
        { name: "sm", multiplier: 0.5 },
        { name: "md", multiplier: 1 },
        { name: "lg", multiplier: 2 },
        { name: "xl", multiplier: 3 },
        { name: "2xl", multiplier: 4 },
        { name: "full", multiplier: 0, exactValue: 9999 },
      ],
      unit: "px",
    } satisfies BorderRadiusScaleConfig,
  },
  {
    id: "opacity-states",
    label: "Opacity states",
    description: "Set up reusable opacity values for overlays and disabled states.",
    whenToUse:
      "Use when you want shared transparency values for hovers, scrims, disabled UI, or subtle layering effects.",
    stages: ["Goal", "Opacity ladder"],
    starterPresetName: "UI state opacity starter",
    starterPreset: "0 to 100 opacity levels with common intermediate stops.",
    sourceRequirement: "No source token required.",
    defaultPrefix: "opacity",
    generatorType: "opacityScale",
    requiresSource: false,
    config: {
      steps: [
        { name: "0", value: 0 },
        { name: "10", value: 10 },
        { name: "20", value: 20 },
        { name: "30", value: 30 },
        { name: "40", value: 40 },
        { name: "50", value: 50 },
        { name: "60", value: 60 },
        { name: "70", value: 70 },
        { name: "80", value: 80 },
        { name: "90", value: 90 },
        { name: "95", value: 95 },
        { name: "100", value: 100 },
      ],
    } satisfies OpacityScaleConfig,
  },
  {
    id: "layer-stack",
    label: "Layer stack",
    description: "Create semantic z-index layers for interface depth.",
    whenToUse:
      "Use when overlays, sticky UI, dropdowns, modals, and toasts need a stable stacking order across the product.",
    stages: ["Goal", "Named layers"],
    starterPresetName: "App layer stack starter",
    starterPreset: "below, base, raised, dropdown, sticky, overlay, modal, and toast layers.",
    sourceRequirement: "No source token required.",
    defaultPrefix: "zIndex",
    generatorType: "zIndexScale",
    requiresSource: false,
    config: {
      steps: [
        { name: "below", value: -1 },
        { name: "base", value: 0 },
        { name: "raised", value: 10 },
        { name: "dropdown", value: 100 },
        { name: "sticky", value: 200 },
        { name: "overlay", value: 300 },
        { name: "modal", value: 400 },
        { name: "toast", value: 500 },
      ],
    } satisfies ZIndexScaleConfig,
  },
  {
    id: "elevation-shadows",
    label: "Elevation shadows",
    description: "Generate consistent depth tokens for surfaces and overlays.",
    whenToUse:
      "Use when cards, modals, and menus need a repeatable shadow scale instead of one-off effects.",
    stages: ["Goal", "Shadow scale", "Depth scale", "Surface aliases"],
    starterPresetName: "Elevation starter",
    starterPreset: "Five shadow levels plus component.card, modal, and dropdown starters.",
    sourceRequirement: "No source token required.",
    defaultPrefix: "shadow",
    generatorType: "shadowScale",
    requiresSource: false,
    config: {
      color: "#000000",
      steps: [
        { name: "sm", offsetX: 0, offsetY: 1, blur: 2, spread: 0, opacity: 0.05 },
        { name: "md", offsetX: 0, offsetY: 4, blur: 6, spread: -1, opacity: 0.1 },
        { name: "lg", offsetX: 0, offsetY: 10, blur: 15, spread: -3, opacity: 0.1 },
        { name: "xl", offsetX: 0, offsetY: 20, blur: 25, spread: -5, opacity: 0.1 },
        { name: "2xl", offsetX: 0, offsetY: 25, blur: 50, spread: -12, opacity: 0.25 },
      ],
    } satisfies ShadowScaleConfig,
    semanticStarter: {
      prefix: "component",
      mappings: [
        { semantic: "card", step: "md" },
        { semantic: "modal", step: "xl" },
        { semantic: "dropdown", step: "lg" },
      ],
    },
  },
  {
    id: "custom-formula",
    label: "Custom formula scale",
    description: "Start from a flexible formula when the built-in scales do not fit.",
    whenToUse:
      "Use when you need a bespoke numeric system or want to prototype a non-standard scale before locking it in.",
    stages: ["Goal", "Formula", "Named steps"],
    starterPresetName: "Formula sandbox starter",
    starterPreset: "A numeric base × multiplier formula with editable sm, md, and lg steps.",
    sourceRequirement: "Works standalone, or you can point it at any compatible base token later.",
    sourceTokenTypes: ["number", "dimension"],
    defaultPrefix: "scale",
    generatorType: "customScale",
    requiresSource: false,
    config: {
      outputType: "number",
      steps: [
        { name: "sm", index: -2, multiplier: 0.5 },
        { name: "md", index: 0, multiplier: 1 },
        { name: "lg", index: 2, multiplier: 2 },
      ],
      formula: "base * multiplier",
      roundTo: 2,
    } satisfies CustomScaleConfig,
  },
];

export function getStarterTemplateForGeneratorType(
  generatorType: GeneratorType,
): GraphTemplate | undefined {
  return GRAPH_TEMPLATES.find((template) => template.generatorType === generatorType);
}

export function cloneStarterConfigForGeneratorType(
  generatorType: GeneratorType,
): GeneratorConfig | undefined {
  const template = getStarterTemplateForGeneratorType(generatorType);
  if (!template) return undefined;
  return cloneValue(template.config);
}
