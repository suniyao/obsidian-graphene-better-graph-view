import { Plugin, TFile, Notice, requestUrl } from 'obsidian';
import { BetterGraphView, VIEW_TYPE_GRAPH } from './GraphView';
import { CombinedSettingTab } from './GraphSettings';
import { BetterGraphSettings, DEFAULT_SETTINGS } from './types';
import { EmbeddingService } from './EmbeddingService';

interface CombinedPluginSettings extends BetterGraphSettings {
    // All settings are already in BetterGraphSettings
}

const COMBINED_DEFAULT_SETTINGS: CombinedPluginSettings = {
    ...DEFAULT_SETTINGS
}

export default class CombinedPlugin extends Plugin {
    settings: CombinedPluginSettings;
    embeddingService: EmbeddingService;
    embeddingStatusEl: HTMLElement | null = null;

    async ensureDataStructure(): Promise<void> {
        const dataFile = `${this.app.vault.configDir}/plugins/graphene/data.json`;
        
        let data = {
            version: '1.0.0',
            embeddings: {
                version: '1.0.0',
                files: {},
                embeddings: {}
            },
            graph: {
                nodes: [],
                links: []
            }
        };
        
        if (await this.app.vault.adapter.exists(dataFile)) {
            try {
                const existingData = await this.app.vault.adapter.read(dataFile);
                const parsed = JSON.parse(existingData);
                
                // Merge with existing data
                data = {
                    ...data,
                    ...parsed,
                    embeddings: parsed.embeddings || data.embeddings,
                    graph: parsed.graph || data.graph
                };
            } catch (error) {
                console.error('Error reading data.json:', error);
            }
        }
        
        await this.app.vault.adapter.write(
            dataFile,
            JSON.stringify(data, null, 2)
        );
    }

    async onload() {
        await this.loadSettings();
        this.embeddingService = new EmbeddingService(this.settings, this.app);
        await this.ensureDataStructure();
        await this.embeddingService.loadCache();

        // Register the Better Graph view
        this.registerView(
            VIEW_TYPE_GRAPH,
            (leaf) => new BetterGraphView(leaf, this)
        );

        // Better Graph ribbon icon
        this.addRibbonIcon('dot-network', 'Better Graph View', () => {
            this.activateView();
        });

        // AI Summary & Tags ribbon icon
        this.addRibbonIcon('bot', 'Generate AI Summary & Tags', () => {
            this.generateSummaryAndTags();
        });

        // Better Graph commands
        this.addCommand({
            id: 'open-better-graph-view',
            name: 'Open Better Graph View',
            callback: () => {
                this.activateView();
            }
        });

        this.addCommand({
            id: 'generate-embeddings',
            name: 'Generate Embeddings for All Notes',
            callback: async () => {
                await this.generateEmbeddingsForAllNotes();
            }
        });

        // AI Summary & Tags command
        this.addCommand({
            id: 'generate-summary-tags',
            name: 'Generate Summary and Tags',
            callback: () => {
                this.generateSummaryAndTags();
            }
        });

        // Add combined settings tab
        this.addSettingTab(new CombinedSettingTab(this.app, this));
    }

    async generateEmbeddings(showProgress = true): Promise<void> {
        const progress = showProgress ? new Notice('', 0) : null;
        
        await this.embeddingService.generateIncrementalEmbeddings(
            (current, total, fileName) => {
                if (progress) {
                    progress.setMessage(`Processing ${current}/${total}: ${fileName}`);
                }
            },
            () => {
                if (this.embeddingStatusEl) {
                    this.updateEmbeddingStatusUI();
                }
            }
        );
        // After incremental generation, persist embeddings into data.json
        await this.syncIncrementalEmbeddingsToData();
        
        if (progress) {
            progress.hide();
        }
    }

    /**
     * Copy embeddings produced by the incremental generator (held in embedding-cache.json)
     * into the plugin's persistent data.json so GraphView can access them via getEmbeddingLocally.
     * Also performs a flattening migration if an older nested embeddings structure is detected.
     */
    private async syncIncrementalEmbeddingsToData(): Promise<void> {
        try {
            const data = await this.loadData() || {};
            // Migration: if data.embeddings has a nested shape { version, embeddings: {..} }
            if (data.embeddings && data.embeddings.version && data.embeddings.embeddings) {
                data.embeddings = data.embeddings.embeddings; // flatten
            }
            if (!data.embeddings) data.embeddings = {};
            const cacheEmbeddings = (this.embeddingService as any).embeddingCache?.embeddings || {};
            let newCount = 0;
            for (const [path, vector] of Object.entries(cacheEmbeddings)) {
                if (Array.isArray(vector) && vector.length > 0) {
                    if (!data.embeddings[path] || data.embeddings[path].length === 0) newCount++;
                    data.embeddings[path] = vector;
                }
            }
            await this.saveData(data);
            if (newCount > 0) {
                new Notice(`Synced ${newCount} new embeddings to data.json`);
            }
        } catch (e) {
            console.error('Failed syncing incremental embeddings to data.json', e);
            new Notice('Embedding sync failed; see console');
        }
    }

    // Update the updateEmbeddingStatusUI method:

    // ...existing code...

    // ...existing code...

updateEmbeddingStatusUI(): void {
    if (!this.embeddingStatusEl) return;
    
    const stats = this.embeddingService.getEmbeddingStats();
    
    this.embeddingStatusEl.empty();
    
    const statusContainer = this.embeddingStatusEl.createDiv('embedding-status-container');
    
    // Header
    statusContainer.createEl('h4', { text: 'Embedding Status' });
    
    // Progress bar container
    const progressContainer = statusContainer.createDiv('embedding-progress-container');
    const progressBar = progressContainer.createDiv('embedding-progress-bar');
    
    // Calculate percentages
    const percentage = stats.total > 0 ? Math.round((stats.upToDate / stats.total) * 100) : 0;
    
    if (stats.total > 0) {
        const upToDateWidth = (stats.upToDate / stats.total) * 100;
        const modifiedWidth = (stats.modified / stats.total) * 100;
        const newWidth = (stats.new / stats.total) * 100;
        
        // Up to date segment (accent color)
        if (stats.upToDate > 0) {
            const upToDateSegment = progressBar.createDiv('progress-segment progress-accent');
            upToDateSegment.style.width = `${upToDateWidth}%`;
        }
        
        // Modified + New segments (gray)
        const needsUpdateWidth = modifiedWidth + newWidth;
        if (needsUpdateWidth > 0) {
            const needsUpdateSegment = progressBar.createDiv('progress-segment progress-gray');
            needsUpdateSegment.style.width = `${needsUpdateWidth}%`;
        }
    }
    
    // Progress percentage text overlay
    const progressText = progressContainer.createDiv('progress-text');
    progressText.textContent = `${percentage}% complete`;
    
    // Legend
    const legend = statusContainer.createDiv('embedding-legend');
    
    // Up to date legend item
    const upToDateItem = legend.createDiv('legend-item');
    upToDateItem.createDiv('legend-color legend-accent');
    upToDateItem.createSpan({ text: `Up to date (${stats.upToDate})` });
    
    // Needs update legend item (combines modified + new)
    const needsUpdateCount = stats.modified + stats.new;
    if (needsUpdateCount > 0) {
        const needsUpdateItem = legend.createDiv('legend-item');
        needsUpdateItem.createDiv('legend-color legend-gray');
        needsUpdateItem.createSpan({ text: `Needs update (${needsUpdateCount})` });
    }
    
    // Update button if needed
    if (stats.modified + stats.new > 0) {
        const updateButton = statusContainer.createEl('button', {
            text: 'Update Embeddings',
            cls: 'mod-cta embedding-update-button'
        });
        
        updateButton.onclick = async () => {
            updateButton.disabled = true;
            updateButton.setText('Updating...');
            await this.generateEmbeddings(true);
            updateButton.disabled = false;
            this.updateEmbeddingStatusUI();
        };
    }
}

// ...existing code...

    createStatusItem(container: HTMLElement, label: string, count: number, type: string): void {
        const item = container.createDiv(`status-item status-${type}`);
        item.createSpan({ text: label, cls: 'status-label' });
        item.createSpan({ text: count.toString(), cls: 'status-count' });
    }

    // Better Graph Methods
    async activateView() {
        const { workspace } = this.app;
        
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_GRAPH)[0];
        
        if (!leaf) {
            const newLeaf = workspace.getLeaf('tab');
            await newLeaf.setViewState({
                type: VIEW_TYPE_GRAPH,
                active: true,
            });
            leaf = newLeaf;
        }
        
        workspace.revealLeaf(leaf);
    }

    async generateEmbeddingsForAllNotes(): Promise<void> {
        if (!this.settings.openaiApiKey) {
            new Notice('Please configure OpenAI API key in settings first');
            return;
        }

        const files = this.app.vault.getMarkdownFiles();
        const notice = new Notice('Generating embeddings...', 0);
        
        let successCount = 0;
        let errorCount = 0;
        let tokensSaved = 0;
        
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                notice.setMessage(`Generating embeddings... ${i + 1}/${files.length}`);
                
                try {
                    const content = await this.app.vault.read(file);
                    
                    // Extract only headings and first N words
                    const cleanContent = this.embeddingService.cleanTextForEmbedding(content);
                    
                    if (cleanContent.trim()) {
                        // Show token savings
                        const fullContent = content.replace(/---[\s\S]*?---\n?/m, '').trim();
                        const fullTokens = this.embeddingService.estimateTokenCount(fullContent);
                        const reducedTokens = this.embeddingService.estimateTokenCount(cleanContent);
                        tokensSaved += (fullTokens - reducedTokens);
                        
                        const embedding = await this.embeddingService.getEmbedding(cleanContent);
                        await this.storeEmbeddingLocally(file.path, embedding);
                        
                        // Store metadata about what was embedded
                        const metadata = {
                            embeddedAt: new Date().toISOString(),
                            method: `headings-and-first-${this.settings.embeddingWordLimit}-words`,
                            textLength: cleanContent.length
                        };
                        await this.storeEmbeddingMetadata(file.path, metadata);
                        
                        successCount++;
                    } else {
                        console.log(`Skipping empty file: ${file.path}`);
                    }
                } catch (error) {
                    console.error(`Error processing file ${file.path}:`, error);
                    errorCount++;
                }

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            notice.hide();
            
            const message = `Generated embeddings for ${successCount} notes` + 
                (errorCount > 0 ? ` (${errorCount} errors)` : '') +
                `\nEstimated tokens saved: ${tokensSaved.toLocaleString()}`;
            
            new Notice(message, 5000);
        } catch (error) {
            notice.hide();
            new Notice(`Error generating embeddings: ${error.message}`);
            console.error('Embedding generation error:', error);
        }
    }

    async storeEmbeddingMetadata(filePath: string, metadata: any): Promise<void> {
        const data = await this.loadData() || {};
        if (!data.embeddingMetadata) {
            data.embeddingMetadata = {};
        }
        data.embeddingMetadata[filePath] = metadata;
        await this.saveData(data);
    }

    async storeEmbeddingLocally(filePath: string, embedding: number[]): Promise<void> {
        const data = await this.loadData() || {};
        if (!data.embeddings) {
            data.embeddings = {};
        }
        data.embeddings[filePath] = embedding;
        await this.saveData(data);
    }

    async getEmbeddingLocally(filePath: string): Promise<number[] | null> {
        const data = await this.loadData() || {};
        return data.embeddings?.[filePath] || null;
    }

    // AI Summary & Tags Methods
    async generateSummaryAndTags() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file');
            return;
        }

        if (!this.settings.openaiApiKey) {
            new Notice('Please set your OpenAI API key in settings');
            return;
        }

        try {
            const content = await this.app.vault.read(activeFile);
            const cleanContent = this.cleanContent(content);

            if (cleanContent.length < 50) {
                new Notice('File content too short for analysis');
                return;
            }

            new Notice('Generating summary and tags...');

            const [summary, tags] = await Promise.all([
                this.callOpenAI('Please provide a brief summary of the following text in 2-3 sentences:\n\n' + cleanContent),
                this.callOpenAI('Generate 3-5 relevant tags for the following text. Return only the tags separated by commas:\n\n' + cleanContent)
            ]);

            await this.updateFileWithResults(activeFile, summary, tags);
            new Notice('Summary and tags generated!');

        } catch (error) {
            console.error('Error:', error);
            new Notice('Error: ' + error.message);
        }
    }

    cleanContent(content: string): string {
        // Remove existing frontmatter
        content = content.replace(/^---\n[\s\S]*?\n---\n/, '');
        // Remove markdown formatting
        content = content.replace(/[#*_`]/g, '');
        // Remove extra whitespace
        content = content.replace(/\n{3,}/g, '\n\n').trim();
        // Limit content length
        return content.slice(0, 6000);
    }

    async callOpenAI(prompt: string): Promise<string> {
        const response = await requestUrl({
            url: 'https://api.openai.com/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.openaiApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 300,
                temperature: 0.7,
            }),
        });

        if (response.status !== 200) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = response.json;
        return data.choices[0].message.content.trim();
    }

    async updateFileWithResults(file: TFile, summary: string, tags: string) {
        const content = await this.app.vault.read(file);
        const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
        const match = content.match(frontmatterRegex);

        let frontmatter = '';
        let bodyContent = content;

        if (match) {
            frontmatter = match[1];
            bodyContent = content.replace(frontmatterRegex, '');
        }

        // Parse existing frontmatter
        const frontmatterLines = frontmatter.split('\n').filter(line => line.trim());
        const frontmatterObj: { [key: string]: any } = {};

        frontmatterLines.forEach(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex > -1) {
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 1).trim();
                frontmatterObj[key] = value;
            }
        });

        // Add AI results
        frontmatterObj['ai-summary'] = `"${summary.replace(/"/g, '\\"')}"`;
        
        const tagArray = tags.split(',').map(tag => tag.trim().replace(/^#/, ''));
        frontmatterObj['ai-tags'] = `[${tagArray.map(tag => `"${tag}"`).join(', ')}]`;

        // Build new content
        const newFrontmatterLines = Object.entries(frontmatterObj).map(([key, value]) => `${key}: ${value}`);
        const newContent = `---\n${newFrontmatterLines.join('\n')}\n---\n${bodyContent}`;

        await this.app.vault.modify(file, newContent);
    }

    // Settings Methods
    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, COMBINED_DEFAULT_SETTINGS, data?.settings || data || {});
    }

    async saveSettings() {
        const data = await this.loadData() || {};
        data.settings = this.settings;
        await this.saveData(data);
        
        if (this.embeddingService) {
            this.embeddingService.updateSettings(this.settings);
        }
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_GRAPH);
    }
}