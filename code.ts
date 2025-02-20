export const getClipboardHtml = () => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>Copy Prompt</title>
    </head>
    <body>
      <script>
        window.onmessage = async (event) => {
          const { type, text } = event.data.pluginMessage;
          if (type === 'copy') {
            try {
              await navigator.clipboard.writeText(text);
              parent.postMessage({ pluginMessage: { type: 'complete' } }, '*');
            } catch (err) {
              console.error('Failed to copy: ', err);
              parent.postMessage({ pluginMessage: { type: 'error', message: err.message } }, '*');
            }
          }
        };
      </script>
    </body>
  </html>
`;

export async function extractDescription(node: BaseNode): Promise<string> {
  if (node.type === "INSTANCE") {
    const mainComponent = await node.getMainComponentAsync();
    return mainComponent?.description ?? "No description provided";
  }
  if ("description" in node && node.description) {
    return node.description;
  }
  return "No description provided in the selected component.";
}

export function extractLinks(description: string): string {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const linksArray = description.match(urlRegex);
  return linksArray ? linksArray.join(", ") : "No links found";
}

export function extractStyleInfo(node: SceneNode): StyleInfo {
  const styles: StyleInfo = {
    fills: "No fill styles",
    strokes: "No stroke styles",
    autoLayout: "Not auto layout",
    paddings: "No padding info",
    position: `x: ${node.x}, y: ${node.y}`,
    size: `width: ${node.width}, height: ${node.height}`,
  };

  if ("fills" in node && node.fills) {
    try {
      styles.fills = Array.isArray(node.fills)
        ? node.fills.map((fill) => JSON.stringify(fill)).join(", ")
        : JSON.stringify(node.fills);
    } catch (e) {
      styles.fills = "Could not parse fills";
    }
  }

  if ("strokes" in node && node.strokes) {
    try {
      styles.strokes = Array.isArray(node.strokes)
        ? node.strokes.map((stroke) => JSON.stringify(stroke)).join(", ")
        : JSON.stringify(node.strokes);
    } catch (e) {
      styles.strokes = "Could not parse strokes";
    }
  }

  if ("layoutMode" in node) {
    const frameNode = node as FrameNode;
    styles.autoLayout =
      frameNode.layoutMode !== "NONE" ? frameNode.layoutMode : "No auto layout";
  }

  if (
    "paddingLeft" in node &&
    "paddingRight" in node &&
    "paddingTop" in node &&
    "paddingBottom" in node
  ) {
    const frameNode = node as FrameNode;
    styles.paddings = `Top: ${frameNode.paddingTop}px, Right: ${frameNode.paddingRight}px, Bottom: ${frameNode.paddingBottom}px, Left: ${frameNode.paddingLeft}px`;
  }

  return styles;
}

export function getProjectDescription(): string {
  const selected = figma.currentPage.selection[0];
  const container = selected.parent ? selected.parent : selected;

  if (
    "description" in container &&
    typeof container.description === "string" &&
    container.description.includes("DESCRIPTION:")
  ) {
    const parts = container.description.split("DESCRIPTION:");
    if (parts.length > 1) {
      return parts[1].trim();
    }
  }

  const descriptionNode = (container as FrameNode).findOne(
    (node) =>
      node.type === "TEXT" &&
      "characters" in node &&
      node.characters.includes("DESCRIPTION:")
  ) as TextNode | null;

  if (descriptionNode) {
    const parts = descriptionNode.characters.split("DESCRIPTION:");
    if (parts.length > 1) {
      return parts[1].trim();
    }
  }

  return DEFAULT_DESCRIPTION;
}

export function generatePrompt(metadata: DesignMetadata): string {
  return `
  Project Description: ${getProjectDescription()}

  General Guideline for creating a React component: ${COMPONENT_GUIDELINES}

  Description: ${metadata.description}

  Links: ${metadata.links}

  Note: The links provided may reference pre-existing components. Please adjust the generated component accordingly.

  Styles:
  - Fills: ${metadata.styles.fills}
  - Strokes: ${metadata.styles.strokes}

  Structure (child components):
  ${metadata.structure}

  Please use appropriate HTML and CSS to mimic the layout and design.

  Create a React component that replicates the Figma design mentioned above.
  Also create an example of how to use the component in a React application (as a propless component).
  `;
}

const getBasicNodeInfo = (node: SceneNode, indentation: string) => {
  return `${indentation}- ${node.type}${node.name ? ` (${node.name})` : ""}`;
};

const getPositionAndSizeInfo = (node: SceneNode, indentation: string) => {
  return `${indentation}- Position: ${node.x}, ${node.y}`;
};

const getDescriptionInfo = (node: SceneNode, indentation: string) => {
  return `${indentation}- Description: ${node.description}`;
};

const getNodeTypeSpecificInfo = (node: SceneNode, indentation: string) => {
  return `${indentation}- Node Type Specific Info: ${node.type}`;
};

const getConstraintsInfo = (
  node: SceneNode,
  indentation: string,
  styleIndentation: string
) => {
  return `${indentation}- Constraints: ${node.constraints}`;
};

export async function getRecursiveStructure(
  node: SceneNode,
  depth: number = 1
): Promise<string> {
  const indentation = "  ".repeat(depth);
  const styleIndentation = "  ".repeat(depth + 1);
  const lines: string[] = [];

  // Add basic node info
  lines.push(
    `${indentation}- ${node.type}${node.name ? ` (${node.name})` : ""}`
  );

  // Add position and size info
  lines.push(...getBasicNodeInfo(node, indentation));

  // Add description and links
  if ("description" in node && node.description) {
    lines.push(...getDescriptionInfo(node, indentation));
  }

  // Add node-specific metadata
  lines.push(
    ...(await getNodeTypeSpecificInfo(node, indentation, styleIndentation))
  );

  // Add constraints
  if ("constraints" in node) {
    lines.push(getConstraintsInfo(node, indentation, styleIndentation));
  }

  // Add children
  if ("children" in node && node.children?.length > 0) {
    const childrenStructures = await Promise.all(
      node.children.map((child) => getRecursiveStructure(child, depth + 1))
    );
    lines.push(...childrenStructures);
  }

  return lines.join("\n");
}

export async function extractStructureInfo(node: SceneNode): Promise<string> {
  if ("children" in node && node.children && node.children.length > 0) {
    const childStructures = await Promise.all(
      node.children.map((child) => getRecursiveStructure(child, 1))
    );
    return childStructures.join("\n");
  }
  return "No child structure found.";
}

export const DEFAULT_DESCRIPTION =
  "This is figma design for real-world medium alternative Conduit app (also known as the mother of all apps).";

export const COMPONENT_GUIDELINES = `
  - We use typescript
  - We only create view layer, no business logic or state management
  - We use Tailwind CSS for styling
  - We use React for the view layer
  - We use the Figma file as a reference for the component design
  - We pass props to the component to customize the design as well as handlers
  - We pass children component props to children components (our props essentially parallel the component hierarchy)

  Example: 
  
  type TButtonProps = {
    textProps: TTextProps;
    onClick: () => void;
  }

  const Button: React.FC<TButtonProps> = ({ textProps, onClick }) => {
    return <button onClick={onClick}><Text {...textProps} /></button>
  }

  type TTextProps = {
    text: string;
    color: string;
  }

  const Text: React.FC<TTextProps> = ({ text, color }) => {
    return <p className={twMerge("text-sm", color)}>{text}</p>
  }
`;

export interface StyleInfo {
  fills: string;
  strokes: string;
  autoLayout?: string;
  paddings?: string;
  position?: string;
  size?: string;
}

export interface DesignMetadata {
  description: string;
  links: string;
  styles: StyleInfo;
  structure: string;
}

export interface NodeConstraints {
  horizontal: string;
  vertical: string;
}

async function main() {
  if (figma.currentPage.selection.length === 0) {
    figma.notify("Please select a component before running the plugin.");
    figma.closePlugin();
    return;
  }

  const selected = figma.currentPage.selection[0];

  const metadata: DesignMetadata = {
    description: await extractDescription(selected),
    links: extractLinks(await extractDescription(selected)),
    styles: extractStyleInfo(selected),
    structure: await extractStructureInfo(selected),
  };

  const prompt = generatePrompt(metadata);

  figma.notify("LLM prompt generated! Check the console for details.");
  console.log(prompt);

  // Show a non-visible UI for clipboard operations
  figma.showUI(getClipboardHtml(), { visible: false });

  figma.ui.onmessage = (msg) => {
    if (msg.type === "complete") {
      figma.notify("Prompt copied to clipboard!");
      figma.closePlugin();
    } else if (msg.type === "error") {
      figma.notify(`Error copying to clipboard: ${msg.message}`);
      figma.closePlugin();
    }
  };

  figma.ui.postMessage({ type: "copy", text: prompt });
}

main();
