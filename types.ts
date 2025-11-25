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
    
    // Graph Display - Updated physics values
    nodeSize: 6,
    linkDistance: 80,      // Reduced from 100
    repulsionForce: 500,   // Increased from 300
    centerForce: 0.1,      // Reduced from 0.3
    
    // Link Appearance
    defaultLinkThickness: 2,
    minLinkThickness: 0.5,
    maxLinkThickness: 8,
    linkThickness: {}
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
    type?: 'link' | 'tag-link';
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