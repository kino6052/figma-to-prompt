const getClipboardHtml = () => `
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

async function extractDescription(node) {
  if (node.type === "INSTANCE") {
    const mainComponent = await node.getMainComponentAsync();
    return mainComponent?.description || "No description provided";
  }
  return "description" in node && node.description
    ? node.description
    : "No description provided in the selected component.";
}

function extractLinks(description) {
  const links = description.match(/(https?:\/\/[^\s]+)/g);
  return links ? links.join(", ") : "No links found";
}

async function extractStyleInfo(node) {
  const styles = {
    fills: "No fill styles",
    strokes: "No stroke styles",
    autoLayout: "Not auto layout",
    paddings: "No padding info",
    position: `x: ${node.x}, y: ${node.y}`,
    size: `width: ${node.width}, height: ${node.height}`,
    fontFamily: "No font family",
    fontSize: "No font size",
  };

  const processPaints = async (paints: Paint[]) => {
    if (!Array.isArray(paints)) return JSON.stringify(paints);
    const processed = await Promise.all(
      paints.map(async (paint) => {
        return JSON.stringify(paint);
      })
    );
    return processed.join(", ");
  };

  try {
    if ("fills" in node && node.fills) {
      styles.fills = await processPaints(node.fills);
    }
  } catch (e) {
    console.error(e);
    styles.fills = "Could not parse fills";
  }

  try {
    if ("strokes" in node && node.strokes) {
      styles.strokes = await processPaints(node.strokes);
    }
  } catch (e) {
    console.error(e);
    styles.strokes = "Could not parse strokes";
  }

  // handle font family
  if ("fontName" in node) {
    styles.fontFamily = JSON.stringify(node.fontName);
  }

  if ("layoutMode" in node) {
    styles.autoLayout =
      node.layoutMode !== "NONE" ? node.layoutMode : "No auto layout";
  }

  if (
    "paddingLeft" in node &&
    "paddingRight" in node &&
    "paddingTop" in node &&
    "paddingBottom" in node
  ) {
    styles.paddings = `Top: ${node.paddingTop}px, Right: ${node.paddingRight}px, Bottom: ${node.paddingBottom}px, Left: ${node.paddingLeft}px`;
  }

  // handle font size
  if ("fontSize" in node) {
    styles.fontSize = node.fontSize;
  }

  return styles;
}

function getProjectDescription() {
  const selected = figma.currentPage.selection[0];
  const container = selected.parent ? selected.parent : selected;

  if (
    "description" in container &&
    typeof container.description === "string" &&
    container.description.includes("DESCRIPTION:")
  ) {
    const parts = container.description.split("DESCRIPTION:");
    if (parts.length > 1) return parts[1].trim();
  }

  const descriptionNode = container.findOne(
    (node) =>
      node.type === "TEXT" &&
      "characters" in node &&
      node.characters.includes("DESCRIPTION:")
  );
  if (descriptionNode) {
    const parts = descriptionNode.characters.split("DESCRIPTION:");
    if (parts.length > 1) return parts[1].trim();
  }

  return DEFAULT_DESCRIPTION;
}

function generatePrompt(metadata) {
  return `
Project Description: ${getProjectDescription()}

General Guideline for creating a React component: ${COMPONENT_GUIDELINES}

Description: ${metadata.description}

Links: ${metadata.links}

Note: The links provided may reference pre-existing components. Please adjust the generated component accordingly.

Styles: ${JSON.stringify(metadata.styles)}

Structure (child components):
${metadata.structure}

Please use appropriate HTML and CSS to mimic the layout and design.

Create a React component that replicates the Figma design mentioned above.
Also create an example of how to use the component in a React application (as a propless component).
`;
}
async function getRecursiveStructure(node, depth = 1) {
  const indent = "  ".repeat(depth);
  const lines = [
    `${indent}- ${node.type}${node.name ? ` (${node.name})` : ""}`,
    `${indent}- Position: ${node.x}, ${node.y}`,
  ];

  if ("description" in node && node.description) {
    lines.push(`${indent}- Description: ${node.description}`);
  }
  lines.push(`${indent}- Node Type Specific Info: ${node.type}`);
  lines.push(
    `${indent}- Node Styles: ${JSON.stringify(await extractStyleInfo(node))}`
  );

  if ("constraints" in node) {
    lines.push(`${indent}- Constraints: ${JSON.stringify(node.constraints)}`);
  }

  // If the node is an instance, extract its structure.
  if (node.type === "INSTANCE") {
    const mainComponent = await node.getMainComponentAsync();
    if (mainComponent) {
      lines.push(`${indent}- Component Reference: ${mainComponent.name}`);
      // If the instance has overridden children, process them.
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          lines.push(await getRecursiveStructure(child, depth + 1));
        }
      }
      // Otherwise, use the main component's children.
      else if (mainComponent.children && mainComponent.children.length > 0) {
        for (const child of mainComponent.children) {
          lines.push(await getRecursiveStructure(child, depth + 1));
        }
      }
    }
  }
  // For all other node types that have children.
  else if ("children" in node && node.children && node.children.length > 0) {
    for (const child of node.children) {
      lines.push(await getRecursiveStructure(child, depth + 1));
    }
  }

  return lines.join("\n");
}

async function extractStructureInfo(node) {
  if ("children" in node && node.children && node.children.length > 0) {
    const structures = await Promise.all(
      node.children.map((child) => getRecursiveStructure(child, 1))
    );
    return structures.join("\n");
  }
  return "No child structure found.";
}

const DEFAULT_DESCRIPTION =
  "This is figma design for real-world medium alternative Conduit app (also known as the mother of all apps).";

const COMPONENT_GUIDELINES = `
- We use TypeScript
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

async function main() {
  if (figma.currentPage.selection.length === 0) {
    figma.notify("Please select a component before running the plugin.");
    figma.closePlugin();
    return;
  }

  const selected = figma.currentPage.selection[0];
  const description = await extractDescription(selected);
  const metadata = {
    description,
    links: extractLinks(description),
    styles: await extractStyleInfo(selected),
    structure: await extractStructureInfo(selected),
  };

  const prompt = generatePrompt(metadata);

  figma.notify("LLM prompt generated! Check the console for details.");
  console.log(prompt);

  // Use a hidden UI to handle clipboard actions
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
