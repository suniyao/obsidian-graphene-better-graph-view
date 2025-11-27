export interface LinkThickness {
    [linkId: string]: number;
}

export interface BetterGraphSettings {
    // API Keys
    openaiApiKey: string;
    pineconeApiKey: string;
    pineconeEnvironment: string;
    pineconeIndexName: string;
    
    // Embedding Settings
    useEmbeddings: boolean;
    similarityThreshold: number;
    embeddingWordLimit: number;
    embeddingWordSkip?: number; // number of initial words to skip (for skipping format/template text)
    excludeHeadingsFromEmbedding?: boolean; // if true, don't include markdown headings in embedding text
    maxSimilarLinksPerNode?: number; // cap number of similarity links originating from a node
    dynamicSimilarityPruning?: boolean; // use per-node distribution to prune weak links
    // Local embedding (optional)
    useLocalEmbeddings?: boolean;
    localEmbeddingEndpoint?: string;
    localModelName?: string;
    
    // Graph Display
    nodeSize: number;
    linkDistance: number;
    repulsionForce: number;
    centerForce: number;
    
    // Link Appearance
    defaultLinkThickness: number;
    minLinkThickness: number;
    maxLinkThickness: number;
    linkThickness: Record<string, number>; // Custom thickness per link
    dottedLinkThickness: number;
}

export const DEFAULT_SETTINGS: BetterGraphSettings = {
    // API Keys
    openaiApiKey: '',
    pineconeApiKey: '',
    pineconeEnvironment: '',
    pineconeIndexName: '',
    
    // Embedding Settings
    useEmbeddings: false,
    similarityThreshold: 0.7,
    embeddingWordLimit: 100,
    embeddingWordSkip: 0,
    excludeHeadingsFromEmbedding: true,
    maxSimilarLinksPerNode: 12,
    dynamicSimilarityPruning: false,
    // Local embedding defaults
    useLocalEmbeddings: false,
    localEmbeddingEndpoint: 'http://127.0.0.1:8000/embed',
    localModelName: 'thenlper/gte-large',
    
    // Graph Display - Updated physics values
    nodeSize: 6,
    linkDistance: 80,      // Reduced from 100
    repulsionForce: 500,   // Increased from 300
    centerForce: 0.1,      // Reduced from 0.3
    
    // Link Appearance
    defaultLinkThickness: 2,
    minLinkThickness: 0.5,
    maxLinkThickness: 8,
    linkThickness: {},
    dottedLinkThickness: 1.5,
};

export interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    path: string;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
    embedding?: number[];
    hidden?: boolean;
    type?: 'file' | 'tag' | 'attachment';
    connectionCount?: number;  // Add this for tag sizing
    status?: 'up-to-date' | 'modified' | 'new' | 'processing'; // Add this
}

export interface GraphLink {
    source: string;
    target: string;
    id: string;
    similarity?: number;
    thickness?: number;
    type?: 'link' | 'tag-link' | 'manual-link';
}

// Add these interfaces
export interface FileEmbeddingStatus {
    path: string;
    lastModified: number;
    embeddingGenerated: number;
    status: 'up-to-date' | 'modified' | 'new' | 'processing';
}

export interface EmbeddingCache {
    version: string;
    files: Record<string, FileEmbeddingStatus>;
    embeddings: Record<string, number[]>;
}