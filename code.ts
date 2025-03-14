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

const shouldExpandComponents = true;

type TNode = BaseNode | InstanceNode | ComponentNode | FrameNode

const processorMap =
{
  'processDescription': async (node: TNode) => {
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
  'processLinks': async (node: TNode) => {
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
  'processStyles': async (node: TNode) => {
    const styleInfo: Record<string, unknown> = {};

    const hasCss = 'getCSSAsync' in node;

    // Process CSS styles from dev mode
    if ('getCSSAsync' in node) {
      try {
        const cssStyles = await (node as FrameNode).getCSSAsync();
        styleInfo.css = cssStyles;
      } catch (err) {
        console.error('Failed to get CSS styles:', err);
        styleInfo.css = 'Unable to retrieve CSS styles';
      }
    }
    
    // Try to get computed styles if available
    if (!hasCss && 'getComputedStyleAsync' in node) {
    
      try {
        const computedStyles = await (node as any).getComputedStyleAsync();
        styleInfo.computedStyles = computedStyles;
      } catch (err) {
        console.error('Failed to get computed styles:', err);
      }
    }

    // Process auto layout properties
    if ('layoutMode' in node) {
      styleInfo.layout = {
        mode: node.layoutMode, // 'HORIZONTAL' or 'VERTICAL' or 'NONE'
        primaryAxisSizingMode: node.primaryAxisSizingMode,
        counterAxisSizingMode: node.counterAxisSizingMode,
        primaryAxisAlignItems: node.primaryAxisAlignItems,
        counterAxisAlignItems: node.counterAxisAlignItems,
        paddingBetweenItems: node.itemSpacing,
        flex: {
          direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
          justifyContent: node.primaryAxisAlignItems,
          alignItems: node.counterAxisAlignItems,
          gap: node.itemSpacing
        }
      };
    }

    // Process size constraints
    if ('constraints' in node) {
      styleInfo.constraints = node.constraints;
    }

    // Process max dimensions
    if ('maxWidth' in node) {
      styleInfo.maxWidth = node.maxWidth;
    }

    if ('maxHeight' in node) {
      styleInfo.maxHeight = node.maxHeight;
    }

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
  processText: async (node: TNode) => {
    if (node.type === 'TEXT') {
      return {
        text: node.characters
      };
    }

    return {
      text: undefined
    };
  },
  processChildren: async (node: TNode) => {
    const process = async (children: TNode[]) => await Promise.all(children?.map(async (child) => convertTree(child, processorMap)))

    if ((node as FrameNode).annotations?.find(annotation => annotation.label === 'skip')) {
      console.warn('Skipping node', node.name);
      return {
        children: []
      };
    }

    if (node.type === 'INSTANCE') {
      const mainComponent = await node.getMainComponentAsync();

      if (!shouldExpandComponents) {
        return {
          children: (mainComponent?.children as TNode[] ?? []).map(child => ({
            type: 'INSTANCE',
            name: child.name,
            children: []
          }))
        };
      }

      return {
        children: await process(mainComponent?.children as TNode[] ?? [])
      };
    }

    if (node.type === 'TEXT') {
      return {
        text: node.characters
      };
    }

    

    return {
      children: await process((node as FrameNode).children as TNode[] ?? [])
    };
  },
  processName: async (node: TNode) => {
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
    console.log({ processorName, test: 1 });
    const processorResult = await processor(_node);
    result = { ...result, ...processorResult };
  }

  return result;
};


const DEFAULT_DESCRIPTION =
  "This is figma design for a website. Genereate scss and pug for the following component tree";

const COMPONENT_GUIDELINES = `
- We use scss for styling
- We use pug for the view layer
- We use the Figma file as a reference for the component design
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
