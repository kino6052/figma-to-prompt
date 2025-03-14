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

const processorMap =
{
  'processDescription': async (node: BaseNode | InstanceNode | ComponentNode) => {
    if (node.type === 'INSTANCE') {
      const mainComponent = await node.getMainComponentAsync();
      return {
        description: mainComponent?.description || "No description provided",
      };
    }

    return {
      description: "No description provided"
    };
  },
  'processLinks': async (node: BaseNode | InstanceNode | ComponentNode) => {
    if (node.type === 'INSTANCE') {
      const mainComponent = await node.getMainComponentAsync();
      return {
        links: mainComponent?.description || "No links provided",
      };
    }

    return {
      links: "No links provided"
    };
  },
  'processStyles': async (node: BaseNode | InstanceNode | ComponentNode) => {
    const styleInfo: Record<string, unknown> = {};

    // Process background styles
    if ('fills' in node) {
      styleInfo.background = node.fills;
    }

    // Process font styles
    if ('fontName' in node) {
      styleInfo.font = {
        family: node.fontName,
        size: node.fontSize,
        weight: node.fontWeight,
        letterSpacing: node.letterSpacing,
        lineHeight: node.lineHeight,
        textCase: node.textCase,
        textDecoration: node.textDecoration
      };
    }

    // Process stroke styles
    if ('strokes' in node) {
      styleInfo.strokes = {
        strokes: node.strokes,
        strokeWeight: node.strokeWeight,
        strokeAlign: node.strokeAlign,
        // strokeCap: node.strokeCap,
        strokeJoin: node.strokeJoin,
        // strokeMiterLimit: node.strokeMiterLimit
      };
    }

    // Process layout styles
    if ('paddingLeft' in node) {
      styleInfo.padding = {
        left: node.paddingLeft,
        right: node.paddingRight,
        top: node.paddingTop,
        bottom: node.paddingBottom
      };
    }

    // Process effects like shadows
    if ('effects' in node) {
      styleInfo.effects = node.effects;
    }

    // Process corner radius
    if ('cornerRadius' in node) {
      styleInfo.cornerRadius = node.cornerRadius;
    }

    // Process layout constraints
    if ('constraints' in node) {
      styleInfo.constraints = node.constraints;
    }

    // Process opacity
    if ('opacity' in node) {
      styleInfo.opacity = node.opacity;
    }

    // For instances, also get styles from main component
    if (node.type === 'INSTANCE') {
      const mainComponent = await node.getMainComponentAsync();
      if (mainComponent) {
        styleInfo.mainComponentStyles = await processorMap.processStyles(mainComponent);
      }
    }

    return {
      styles: Object.keys(styleInfo).length > 0 ? styleInfo : "No styles provided"
    };
  },
  processText: async (node: BaseNode | InstanceNode | ComponentNode) => {
    if (node.type === 'TEXT') {
      return {
        text: node.characters
      };
    }

    return {
      text: undefined
    };
  },
  processChildren: async (node: BaseNode | InstanceNode | ComponentNode) => {
    if (node.type === 'INSTANCE') {
      const mainComponent = await node.getMainComponentAsync();
      return {
        children: mainComponent?.children || []
      };
    }

    return {
      children: []
    };
  },
  processName: async (node: BaseNode | InstanceNode | ComponentNode) => {
    return {
      name: node.name
    };
  }
}

type TFigmaNode = {
  type: string;
  description: string;
  children: TFigmaNode[];
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
// processes node and returns a new node with the processed properties
const convertTree = async (_node: BaseNode | InstanceNode | ComponentNode, processorMap: Record<string, (node: BaseNode | InstanceNode | ComponentNode) => Promise<Record<string, unknown>>>): Promise<TFigmaNode> => {
  let result: TFigmaNode = {} as TFigmaNode;

  for (const [processorName, processor] of Object.entries(processorMap)) {
    console.log({ processorName });
    const processorResult = await processor(_node);
    result = { ...result, ...processorResult };
  }

  return result;
};


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
  const tree = await convertTree(selected, processorMap);
  const prompt = `${DEFAULT_DESCRIPTION} ${COMPONENT_GUIDELINES}`;


  figma.notify("LLM prompt generated! Check the console for details.");
  console.log({ prompt, tree });

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
