import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type CombinedPlugin from './main';
import { EmbeddingService } from 'EmbeddingService';
import { EmbeddingCache } from 'types';

export class CombinedSettingTab extends PluginSettingTab {
    plugin: CombinedPlugin;

    constructor(app: App, plugin: CombinedPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        // API Configuration Section
        containerEl.createEl('h3', { text: 'API Configuration' });

        new Setting(containerEl)
            .setName('OpenAI API Key')
            .setDesc('Required for generating semantic embeddings and AI summaries')
            .addText(text => text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.openaiApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Pinecone API Key')
            .setDesc('Optional: For cloud storage of embeddings')
            .addText(text => text
                .setPlaceholder('Your Pinecone API key')
                .setValue(this.plugin.settings.pineconeApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.pineconeApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Pinecone Environment')
            .setDesc('Your Pinecone environment (e.g., us-west1-gcp)')
            .addText(text => text
                .setPlaceholder('us-west1-gcp')
                .setValue(this.plugin.settings.pineconeEnvironment)
                .onChange(async (value) => {
                    this.plugin.settings.pineconeEnvironment = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Pinecone Index Name')
            .setDesc('Your Pinecone index name')
            .addText(text => text
                .setPlaceholder('obsidian-notes')
                .setValue(this.plugin.settings.pineconeIndexName)
                .onChange(async (value) => {
                    this.plugin.settings.pineconeIndexName = value;
                    await this.plugin.saveSettings();
                }));

        // Embedding Settings Section
        containerEl.createEl('h3', { text: 'Embedding Settings' });

        // Provider selector: OpenAI vs Local
        new Setting(containerEl)
            .setName('Embedding Provider')
            .setDesc('Choose how embeddings are generated')
            .addDropdown(drop => {
                drop.addOption('openai', 'OpenAI');
                drop.addOption('local', 'Local (sentence-transformers)');
                const current = this.plugin.settings.useLocalEmbeddings ? 'local' : 'openai';
                drop.setValue(current);
                drop.onChange(async (value) => {
                    const useLocal = value === 'local';
                    this.plugin.settings.useLocalEmbeddings = useLocal;
                    await this.plugin.saveSettings();
                    new Notice(`Embedding provider set to ${useLocal ? 'Local' : 'OpenAI'}`);
                });
            });

        // Local endpoint configuration
        new Setting(containerEl)
            .setName('Local Embedding Endpoint')
            .setDesc('HTTP endpoint for local embedding server (POST /embed)')
            .addText(text => text
                .setPlaceholder('http://127.0.0.1:8000/embed')
                .setValue(this.plugin.settings.localEmbeddingEndpoint || 'http://127.0.0.1:8000/embed')
                .onChange(async (value) => {
                    this.plugin.settings.localEmbeddingEndpoint = value;
                    await this.plugin.saveSettings();
                }));

        // Max similarity links per node
        new Setting(containerEl)
            .setName('Max Similar Links / Node')
            .setDesc('Upper bound to avoid clutter from generic similarity')
            .addSlider(slider => slider
                .setLimits(1, 50, 1)
                .setValue(this.plugin.settings.maxSimilarLinksPerNode || 12)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxSimilarLinksPerNode = value;
                    await this.plugin.saveSettings();
                }));

        // Dynamic pruning toggle
        new Setting(containerEl)
            .setName('Dynamic Similarity Pruning')
            .setDesc('Keep only links above mean + (0.35 * std) per node (after threshold)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.dynamicSimilarityPruning || false)
                .onChange(async (value) => {
                    this.plugin.settings.dynamicSimilarityPruning = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Use Semantic Similarity')
            .setDesc('Create links based on semantic similarity instead of explicit links')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useEmbeddings)
                .onChange(async (value) => {
                    this.plugin.settings.useEmbeddings = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Similarity Threshold')
            .setDesc('Minimum similarity to create edges (0.1 = loose, 0.9 = strict)')
            .addSlider(slider => slider
                .setLimits(0.1, 0.9, 0.05)
                .setValue(this.plugin.settings.similarityThreshold)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.similarityThreshold = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Exclude Headings from Embedding')
            .setDesc('If enabled, markdown headings are not included in embedding text (reduces format-based similarity)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.excludeHeadingsFromEmbedding ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.excludeHeadingsFromEmbedding = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Skip Initial Words')
            .setDesc('Number of words to skip at the beginning (useful for skipping template/format text)')
            .addSlider(slider => slider
                .setLimits(0, 200, 10)
                .setValue(this.plugin.settings.embeddingWordSkip || 0)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.embeddingWordSkip = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Word Limit for Embeddings')
            .setDesc('Number of words to include from document body (after skipping initial words)')
            .addSlider(slider => slider
                .setLimits(50, 500, 50)
                .setValue(this.plugin.settings.embeddingWordLimit)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.embeddingWordLimit = value;
                    await this.plugin.saveSettings();
                }));

        // Graph Display Settings
        containerEl.createEl('h3', { text: 'Graph Display' });

        new Setting(containerEl)
            .setName('Node Size')
            .setDesc('Size of nodes in the graph')
            .addSlider(slider => slider
                .setLimits(5, 30, 1)
                .setValue(this.plugin.settings.nodeSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.nodeSize = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Link Distance')
            .setDesc('Default distance between connected nodes')
            .addSlider(slider => slider
                .setLimits(20, 200, 10)
                .setValue(this.plugin.settings.linkDistance)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.linkDistance = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Repulsion Force')
            .setDesc('How strongly nodes push each other away')
            .addSlider(slider => slider
                .setLimits(100, 1000, 50)
                .setValue(this.plugin.settings.repulsionForce)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.repulsionForce = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Center Force')
            .setDesc('How strongly nodes are pulled to the center')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.05)
                .setValue(this.plugin.settings.centerForce)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.centerForce = value;
                    await this.plugin.saveSettings();
                }));

        // Link Thickness Settings
        containerEl.createEl('h3', { text: 'Edge Thickness' });

        new Setting(containerEl)
            .setName('Solid edge thickness')
            .setDesc('Thickness for manual/tag edges')
            .addSlider(slider => slider
                .setLimits(0.5, 10, 0.5)
                .setValue(this.plugin.settings.defaultLinkThickness)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.defaultLinkThickness = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Dotted edge size')
            .setDesc('Dot radius for similarity edges')
            .addSlider(slider => slider
                .setLimits(0.5, 4, 0.25)
                .setValue(this.plugin.settings.dottedLinkThickness ?? Math.max(0.5, this.plugin.settings.defaultLinkThickness / 2))
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.dottedLinkThickness = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Minimum Link Thickness')
            .setDesc('Minimum thickness for similarity-based links')
            .addSlider(slider => slider
                .setLimits(0.1, 5, 0.1)
                .setValue(this.plugin.settings.minLinkThickness)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.minLinkThickness = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Maximum Link Thickness')
            .setDesc('Maximum thickness for similarity-based links')
            .addSlider(slider => slider
                .setLimits(2, 15, 0.5)
                .setValue(this.plugin.settings.maxLinkThickness)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxLinkThickness = value;
                    await this.plugin.saveSettings();
                }));

        // Actions Section
        containerEl.createEl('h3', { text: 'Actions' });

        // In the CombinedSettingTab class, update the display method:

        // Add after the embedding model setting
        new Setting(containerEl)
            .setName('Generate embeddings')
            .setDesc('Generate embeddings for all markdown files to enable similarity search')
            .addButton(button => button
                .setButtonText('Generate all')
                .setCta()
                .onClick(async () => {
                    button.setDisabled(true);
                    button.setButtonText('Generating...');
                    await this.plugin.generateEmbeddings(true);
                    button.setDisabled(false);
                    button.setButtonText('Generate all');
                    this.plugin.updateEmbeddingStatusUI();
                }));

        // Add embedding status display
        const statusSetting = new Setting(containerEl)
            .setName('Embedding status')
            .setDesc('Current status of file embeddings');

        this.plugin.embeddingStatusEl = statusSetting.controlEl.createDiv();
        this.plugin.updateEmbeddingStatusUI();

        // Manual sync button (helpful if local generation ran but graph not updating)
        new Setting(containerEl)
            .setName('Sync cache → data.json')
            .setDesc('Force copy of cached incremental embeddings into persistent storage')
            .addButton(btn => btn
                .setButtonText('Sync now')
                .onClick(async () => {
                    // Access private method via bracket to avoid TS complaint if strict
                    const fn = (this.plugin as any).syncIncrementalEmbeddingsToData;
                    if (typeof fn === 'function') {
                        await fn.call(this.plugin);
                        this.plugin.updateEmbeddingStatusUI();
                    } else {
                        new Notice('Sync function unavailable');
                    }
                }));

        // Add a "Clear cache" button for troubleshooting
        new Setting(containerEl)
            .setName('Clear embedding cache')
            .setDesc('Remove all cached embeddings (use if experiencing issues)')
            .addButton(button => button
                .setButtonText('Clear cache')
                .setWarning()
                .onClick(async () => {
                    if (confirm('Are you sure you want to clear all embeddings? You will need to regenerate them.')) {
                        await this.plugin.embeddingService.clearCache();
                        this.plugin.updateEmbeddingStatusUI();
                        new Notice('Embedding cache cleared');
                    }
                }));

        new Setting(containerEl)
            .setName('Reset Customizations')
            .setDesc('Reset all custom settings')
            .addButton(button => button
                .setButtonText('Reset All')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.linkThickness = {};
                    await this.plugin.saveSettings();
                    new Notice('All customizations reset');
                }));
    }
}