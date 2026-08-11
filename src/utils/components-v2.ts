import { MessageFlags } from "discord.js";

export interface V2Section {
  title?: string;
  content: string;
  thumbnailUrl?: string;
}

export interface V2ContainerParams {
  title?: string;
  description?: string;
  accentColor?: number | null;
  thumbnailUrl?: string;
  sections?: V2Section[];
  footer?: string;
  actionRows?: any[];
  dividers?: boolean;
}

export function buildSingleContainer(params: V2ContainerParams) {
  const containerComponents: any[] = [];
  const useDividers = params.dividers ?? true;

  // Title (+ thumbnail optional)
  if (params.title) {
    const titleContent = {
      type: 10, // TextDisplay
      content: params.title.startsWith("#") ? params.title : `# ${params.title}`,
    };

    if (params.thumbnailUrl) {
      containerComponents.push({
        type: 9, // Section
        components: [titleContent],
        accessory: {
          type: 11, // Thumbnail
          media: { url: params.thumbnailUrl },
        },
      });
    } else {
      containerComponents.push(titleContent);
    }
  }

  // Description
  if (params.description) {
    if (params.title && useDividers) {
      containerComponents.push({ type: 14, divider: true, spacing: 1 }); // Separator
    }
    containerComponents.push({ type: 10, content: params.description });
  }

  // Sections
  if (params.sections && params.sections.length > 0) {
    for (const sec of params.sections) {
      if (useDividers) {
        containerComponents.push({ type: 14, divider: true, spacing: 1 });
      }

      const textParts: any[] = [];
      if (sec.title) {
        textParts.push({
          type: 10,
          content: sec.title.startsWith("#") ? sec.title : `## ${sec.title}`,
        });
      }
      textParts.push({ type: 10, content: sec.content });

      if (sec.thumbnailUrl) {
        containerComponents.push({
          type: 9,
          components: textParts,
          accessory: {
            type: 11,
            media: { url: sec.thumbnailUrl },
          },
        });
      } else {
        containerComponents.push(...textParts);
      }
    }
  }

  // Footer
  if (params.footer) {
    if (useDividers) {
      containerComponents.push({ type: 14, divider: true, spacing: 1 });
    }
    containerComponents.push({
      type: 10,
      content: `-# ${params.footer}`, // -# = subtext style Discord markdown
    });
  }

  // Action rows (button/select menu)
  if (params.actionRows) {
    for (const row of params.actionRows) {
      const rowJSON = typeof row.toJSON === "function" ? row.toJSON() : row;
      containerComponents.push(rowJSON);
    }
  }

  return {
    type: 17, // Container
    accent_color: params.accentColor ?? null,
    components: containerComponents,
  };
}

/**
 * Single Discord Components V2 Container payload
 */
export function buildV2Container(params: V2ContainerParams) {
  return {
    components: [buildSingleContainer(params)],
    flags: MessageFlags.IsComponentsV2 as const,
  };
}

/**
 * Multi Discord Components V2 Container payload
 */
export function buildMultiV2Containers(containers: V2ContainerParams[]) {
  return {
    components: containers.map(buildSingleContainer),
    flags: MessageFlags.IsComponentsV2 as const,
  };
}
