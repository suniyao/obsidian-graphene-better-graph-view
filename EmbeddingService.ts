import { Notice, TFile } from 'obsidian';
import { BetterGraphSettings, FileEmbeddingStatus, EmbeddingCache } from './types';

export class EmbeddingService {
    private openaiApiKey: string;
    private pineconeApiKey: string;
    private pineconeEnvironment: string;
    private pineconeIndexName: string;
    private useLocalEmbeddings: boolean;
    private localEmbeddingEndpoint: string;
    private embeddingCache: EmbeddingCache;
    private app: any;

    constructor(settings: BetterGraphSettings, app: any) {
        this.openaiApiKey = settings.openaiApiKey;
        this.pineconeApiKey = settings.pineconeApiKey;
        this.pineconeEnvironment = settings.pineconeEnvironment;
        this.pineconeIndexName = settings.pineconeIndexName;
        this.useLocalEmbeddings = !!settings.useLocalEmbeddings;
        this.localEmbeddingEndpoint = settings.localEmbeddingEndpoint || 'http://127.0.0.1:8000/embed';
        this.app = app;
        this.embeddingCache = {
            version: '1.0.0',
            files: {},
            embeddings: {}
        };
    }

    getLastUpdateTime(): number {
        const times = Object.values(this.embeddingCache.files)
            .map(f => f.embeddingGenerated)
            .filter(t => t > 0);
        
        return times.length > 0 ? Math.max(...times) : 0;
    }

    updateSettings(settings: BetterGraphSettings) {
        this.openaiApiKey = settings.openaiApiKey;
        this.pineconeApiKey = settings.pineconeApiKey;
        this.pineconeEnvironment = settings.pineconeEnvironment;
        this.pineconeIndexName = settings.pineconeIndexName;
        this.useLocalEmbeddings = !!settings.useLocalEmbeddings;
        this.localEmbeddingEndpoint = settings.localEmbeddingEndpoint || this.localEmbeddingEndpoint;
    }

    async loadCache(): Promise<void> {
        try {
            const cacheFile = this.app.vault.adapter.path.join(
                this.app.vault.configDir,
                'plugins',
                'graphene',
                'embedding-cache.json'
            );
            
            if (await this.app.vault.adapter.exists(cacheFile)) {
                const data = await this.app.vault.adapter.read(cacheFile);
                this.embeddingCache = JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load embedding cache:', error);
        }
    }

    async saveCache(): Promise<void> {
        try {
            const cacheFile = this.app.vault.adapter.path.join(
                this.app.vault.configDir,
                'plugins',
                'graphene',
                'embedding-cache.json'
            );
            
            await this.app.vault.adapter.write(
                cacheFile,
                JSON.stringify(this.embeddingCache, null, 2)
            );
        } catch (error) {
            console.error('Failed to save embedding cache:', error);
        }
    }

    getFileStatus(file: TFile): FileEmbeddingStatus['status'] {
        const cached = this.embeddingCache.files[file.path];
        
        if (!cached) {
            return 'new';
        }
        
        if (file.stat.mtime > cached.embeddingGenerated) {
            return 'modified';
        }
        
        return 'up-to-date';
    }

    getEmbeddingStats() {
        const files = this.app.vault.getMarkdownFiles();
        const stats = {
            total: files.length,
            upToDate: 0,
            modified: 0,
            new: 0,
            processing: 0
        };
        
        for (const file of files) {
            const status = this.getFileStatus(file);
            switch (status) {
                case 'up-to-date': stats.upToDate++; break;
                case 'modified': stats.modified++; break;
                case 'new': stats.new++; break;
                case 'processing': stats.processing++; break;
            }
        }
        
        return stats;
    }

        getFileEmbedding(path: string): number[] | undefined {
        return this.embeddingCache.embeddings[path];
    }

    async generateIncrementalEmbeddings(
        onProgress?: (current: number, total: number, fileName: string) => void,
        onStatusUpdate?: () => void
    ): Promise<void> {
        const files = this.app.vault.getMarkdownFiles();
        const needsUpdate: TFile[] = [];
        
        // Check which files need updates
        for (const file of files) {
            const status = this.getFileStatus(file);
            if (status === 'new' || status === 'modified') {
                needsUpdate.push(file);
            }
        }
        
        if (needsUpdate.length === 0) {
            new Notice('All embeddings are up to date!');
            return;
        }
        
        console.log(`[Embedding] Processing ${needsUpdate.length} files`);
        console.log(`[Embedding] API Key format: ${this.openaiApiKey?.substring(0, 20)}...`);
        
        let processed = 0;
        let failed = 0;
        
        for (const file of needsUpdate) {
            // Update status to processing
            this.embeddingCache.files[file.path] = {
                path: file.path,
                lastModified: file.stat.mtime,
                embeddingGenerated: Date.now(),
                status: 'processing'
            };
            
            if (onStatusUpdate) onStatusUpdate();
            
            try {
                const content = await this.app.vault.read(file);
                const cleanedText = this.extractHeadingsAndFirstWords(content);
                
                console.log(`[Embedding] Processing ${file.path}, text length: ${cleanedText.length}`);
                
                // Get embedding
                const embedding = await this.getEmbedding(cleanedText);
                
                console.log(`[Embedding] Got embedding for ${file.path}, length: ${embedding?.length}`);
                
                if (embedding && embedding.length > 0) {
                    this.embeddingCache.embeddings[file.path] = embedding;
                    this.embeddingCache.files[file.path].status = 'up-to-date';
                    this.embeddingCache.files[file.path].embeddingGenerated = Date.now();
                    console.log(`[Embedding] Stored embedding for ${file.path}`);
                    processed++;
                } else {
                    console.warn(`[Embedding] Empty embedding returned for ${file.path}`);
                    failed++;
                }
                
                if (onProgress) {
                    onProgress(processed + failed, needsUpdate.length, file.basename);
                }
                
                // Save cache periodically
                if (processed % 10 === 0) {
                    await this.saveCache();
                }
                
                // Rate limiting - wait 500ms between requests to avoid 429 errors
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.error(`Failed to generate embedding for ${file.path}:`, error);
                failed++;
                
                // If quota exceeded, stop immediately
                if (error.message && error.message.includes('429')) {
                    new Notice('OpenAI API quota exceeded. Please check your API key and billing at platform.openai.com', 10000);
                    break;
                }
                
                // Mark as failed (modified) so it can be retried
                this.embeddingCache.files[file.path].status = 'modified';
            }
        }

        
        await this.saveCache();
        if (onStatusUpdate) onStatusUpdate();
        
        const message = `Embeddings: ${processed} successful, ${failed} failed`;
        new Notice(message);
        console.log(`[Embedding] Complete: ${message}`);
    }

    async clearCache(): Promise<void> {
        this.embeddingCache = {
            version: '1.0.0',
            files: {},
            embeddings: {}
        };
        await this.saveCache();
    }

    async getEmbedding(text: string): Promise<number[]> {
        // Prefer local embeddings when enabled
        const useLocal = this.useLocalEmbeddings;
        const localEndpoint = this.localEmbeddingEndpoint;

        if (useLocal) {
            try {
                const resp = await fetch(localEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text })
                });
                if (!resp.ok) {
                    const err = await resp.text();
                    throw new Error(`Local embedding error: ${resp.status} ${resp.statusText} - ${err}`);
                }
                const data = await resp.json();
                if (!data || !Array.isArray(data.embedding)) {
                    throw new Error('Local embedding server returned invalid payload');
                }
                return data.embedding as number[];
            } catch (e) {
                console.error('Failed to get local embedding, falling back to OpenAI:', e);
                // If local fails, fall through to OpenAI path
            }
        }

        if (!this.openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }

        try {
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input: text,
                    model: 'text-embedding-3-small'
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            const vec: number[] = data.data[0].embedding;
            // Normalize to unit vector to align with local model normalization
            let norm = 0;
            for (const v of vec) norm += v * v;
            norm = Math.sqrt(norm) || 1;
            return vec.map(v => v / norm);
        } catch (error) {
            console.error('Error getting embedding:', error);
            throw error;
        }
    }

    async storeEmbedding(id: string, embedding: number[], metadata: any = {}): Promise<void> {
        if (!this.pineconeApiKey || !this.pineconeEnvironment || !this.pineconeIndexName) {
            // Skip Pinecone storage if not configured
            return;
        }

        try {
            const response = await fetch(`https://${this.pineconeIndexName}-${this.pineconeEnvironment}.svc.pinecone.io/vectors/upsert`, {
                method: 'POST',
                headers: {
                    'Api-Key': this.pineconeApiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    vectors: [{
                        id: id,
                        values: embedding,
                        metadata: metadata
                    }]
                })
            });

            if (!response.ok) {
                throw new Error(`Pinecone API error: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error storing embedding in Pinecone:', error);
            // Don't throw error here to allow local operation
        }
    }

    calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
        if (vec1.length !== vec2.length) {
            throw new Error('Vectors must have the same length');
        }

        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            magnitude1 += vec1[i] * vec1[i];
            magnitude2 += vec2[i] * vec2[i];
        }

        magnitude1 = Math.sqrt(magnitude1);
        magnitude2 = Math.sqrt(magnitude2);

        if (magnitude1 === 0 || magnitude2 === 0) {
            return 0;
        }

        return dotProduct / (magnitude1 * magnitude2);
    }

    extractHeadingsAndFirstWords(content: string, wordLimit: number = 100): string {
        const settings = (this.app?.plugins?.getPlugin?.('graphene')?.settings) as any;
        const wordSkip = settings?.embeddingWordSkip || 0;
        const excludeHeadings = settings?.excludeHeadingsFromEmbedding ?? true;

        // Extract all headings
        const headingRegex = /^#{1,6}\s+(.+)$/gm;
        const headings: string[] = [];
        let match;
        
        while ((match = headingRegex.exec(content)) !== null) {
            headings.push(match[1].trim());
        }

        // Remove frontmatter
        const contentWithoutFrontmatter = content.replace(/^---[\s\S]*?---\n?/m, '');
        
        // Remove headings from content to get body text
        const bodyText = contentWithoutFrontmatter
            .replace(/^#{1,6}\s+.*$/gm, '') // Remove headings
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            .replace(/\[.*?\]\(.*?\)/g, '') // Remove links
            .trim();

        // Get first N words from body text
        const words = bodyText.split(/\s+/).filter(word => word.length > 0);
        // Remove common boilerplate / filler words that inflate similarity
        const STOP = new Set([
            'the','a','an','and','or','of','in','to','for','on','with','by','at','from','this','that','is','are','be','it','as','was','were','will','can','could','should','would','have','has','had','about','note','daily','template','summary','tags'
        ]);
        const filteredWords = words.filter(w => !STOP.has(w.toLowerCase()));
        
        // Apply skip and limit
        const startIdx = Math.max(0, wordSkip);
        const endIdx = Math.min(filteredWords.length, startIdx + wordLimit);
        const selectedWords = filteredWords.slice(startIdx, endIdx);
        const firstWords = selectedWords.join(' ');

        // Combine headings and body (or exclude headings if configured)
        let combinedText: string;
        if (excludeHeadings) {
            combinedText = firstWords;
        } else {
            const headingText = headings.join(' | ');
            combinedText = headingText ? `${headingText}\n\n${firstWords}` : firstWords;
        }

        return combinedText.trim();
    }    cleanTextForEmbedding(content: string): string {
        // Extract headings and first 100 words instead of full content
        const extractedText = this.extractHeadingsAndFirstWords(content);
        
        // Clean the extracted text
        return extractedText
            .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
            .replace(/\*(.*?)\*/g, '$1') // Remove italic
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links, keep text
            .replace(/`(.*?)`/g, '$1') // Remove inline code
            .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
            .trim();
    }

    // Optional: Method to get estimated token count (rough approximation)
    estimateTokenCount(text: string): number {
        // Rough estimation: 1 token ≈ 4 characters for English text
        return Math.ceil(text.length / 4);
    }

    // Optional: Method to check if text is within token limits
    isWithinTokenLimit(text: string, maxTokens: number = 8191): boolean {
        const estimatedTokens = this.estimateTokenCount(text);
        return estimatedTokens <= maxTokens;
    }
}