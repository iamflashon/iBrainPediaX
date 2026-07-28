import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

export interface SitesPluginOptions {
  /**
   * OpenAI Sites manifest relative to the Vite project root.
   *
   * @default ".openai/hosting.json"
   */
  manifest?: string;

  /**
   * Directory where the manifest is packaged, relative to Vite's build outDir.
   *
   * @default ".openai"
   */
  manifestOutputDirectory?: string;
}

/**
 * Packages the OpenAI Sites manifest beside the generated deployment artifact.
 *
 * Vinext and @cloudflare/vite-plugin remain responsible for compiling the
 * application and Worker entry point. This plugin deliberately does not alter
 * Rollup inputs, Vite environments, or Cloudflare output paths; it only checks
 * and copies `.openai/hosting.json` to the final `dist/.openai/` directory
 * expected by the project's artifact validator and deployment system.
 */
export function sites(options: SitesPluginOptions = {}): Plugin {
  const manifest = options.manifest ?? ".openai/hosting.json";
  const manifestOutputDirectory =
    options.manifestOutputDirectory ?? ".openai";

  let resolvedConfig: ResolvedConfig | undefined;
  let packaged = false;

  const packageManifest = async (): Promise<void> => {
    // Vite can invoke output hooks for more than one environment. Copy once.
    if (packaged) return;

    if (!resolvedConfig) {
      throw new Error(
        "[sites] Vite configuration was not resolved before packaging.",
      );
    }

    const projectRoot = resolvedConfig.root;
    const sourcePath = path.resolve(projectRoot, manifest);
    const outputDirectory = path.resolve(
      projectRoot,
      resolvedConfig.build.outDir,
      manifestOutputDirectory,
    );
    const outputPath = path.join(outputDirectory, path.basename(manifest));

    let rawManifest: string;

    try {
      await access(sourcePath);
      rawManifest = await readFile(sourcePath, "utf8");
    } catch (error) {
      throw new Error(
        `[sites] Missing or unreadable Sites manifest: ${sourcePath}`,
        { cause: error },
      );
    }

    try {
      JSON.parse(rawManifest);
    } catch (error) {
      throw new Error(
        `[sites] Sites manifest is not valid JSON: ${sourcePath}`,
        { cause: error },
      );
    }

    await mkdir(outputDirectory, { recursive: true });
    await copyFile(sourcePath, outputPath);
    packaged = true;

    resolvedConfig.logger.info(
      `[sites] Packaged ${path.relative(projectRoot, sourcePath)} → ${path.relative(
        projectRoot,
        outputPath,
      )}`,
    );
  };

  return {
    name: "openai-sites-manifest",
    apply: "build",

    configResolved(config) {
      resolvedConfig = config;
    },

    async buildStart() {
      if (!resolvedConfig) return;

      const sourcePath = path.resolve(resolvedConfig.root, manifest);

      try {
        const rawManifest = await readFile(sourcePath, "utf8");
        JSON.parse(rawManifest);
      } catch (error) {
        this.error(
          `[sites] A valid JSON manifest is required at ${sourcePath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },

    async closeBundle() {
      await packageManifest();
    },
  };
}
