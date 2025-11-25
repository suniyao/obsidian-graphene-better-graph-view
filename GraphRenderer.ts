import * as d3 from 'd3';
import { TFile } from 'obsidian';
import type BetterGraphPlugin from './main';
import type { BetterGraphView } from './GraphView';
import { GraphNode, GraphLink } from './types';
import CombinedPlugin from './main';

export class GraphRenderer {
    private container: HTMLElement;
    private plugin: CombinedPlugin;
    private view: BetterGraphView;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private g: d3.Selection<SVGGElement, unknown, null, undefined>;
    private simulation: d3.Simulation<GraphNode, GraphLink>;
    private nodes: GraphNode[] = [];
    private links: GraphLink[] = [];
    private linkElements: d3.Selection<SVGGElement, GraphLink, SVGGElement, unknown>;
    private nodeElements: d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown>;
    private zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
    private isAnimating: boolean = true;

    constructor(container: HTMLElement, plugin: BetterGraphPlugin, view: BetterGraphView) {
        this.container = container;
        this.plugin = plugin;
        this.view = view;
    }

    isInitialized: boolean = false;

    initialize(nodes: GraphNode[], links: GraphLink[]) {
        this.nodes = nodes;
        this.links = links;
        
        // Clear any existing content
        d3.select(this.container).selectAll('*').remove();
        
        this.setupSVG();
        this.setupDefs();
        this.setupSimulation();
        this.setupLinks();
        this.setupNodes();
        this.setupZoom();
        
        this.isInitialized = true;  // Set the flag
    }

    updateData(nodes: GraphNode[], links: GraphLink[]) {
        if (!this.isInitialized) {
            console.warn('GraphRenderer not initialized yet');
            return;
        }
        
        this.nodes = nodes;
        this.links = links;
        
        // Update simulation
        this.simulation.nodes(this.nodes);
        const linkForce = this.simulation.force('link') as d3.ForceLink<GraphNode, GraphLink>;
        if (linkForce) {
            linkForce.links(this.links);
        }
        
        // Update visual elements
        this.setupLinks();
        this.setupNodes();
        
        // Restart simulation
        this.simulation.alpha(0.3).restart();
    }


    private setupDefs() {
        // Add arrow markers for directed links
        const defs = this.svg.append('defs');
        
        defs.append('marker')
            .attr('id', 'arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 15)  // Reduced from 20
            .attr('refY', 0)
            .attr('markerWidth', 4)  // Reduced from 6
            .attr('markerHeight', 4)  // Reduced from 6
            .attr('orient', 'auto')
            .append('path')
            .attr('fill', 'var(--text-muted)')
            .attr('d', 'M0,-5L10,0L0,5');

        defs.append('marker')
            .attr('id', 'arrow-accent')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 15)
            .attr('refY', 0)
            .attr('markerWidth', 4)
            .attr('markerHeight', 4)
            .attr('orient', 'auto')
            .append('path')
            .attr('fill', 'var(--interactive-accent)')
            .attr('d', 'M0,-5L10,0L0,5');
    }

private setupLinks() {
    this.g.selectAll('.links').remove();
    
    const linksGroup = this.g.append('g')
        .attr('class', 'links');
    
    // Create groups for each link
    this.linkElements = linksGroup.selectAll<SVGGElement, GraphLink>('g.link-group')
        .data(this.links)
        .join('g')
        .attr('class', d => `link-group ${d.type || 'normal'}`);
    
    // Add either solid lines or prepare for dotted lines
    this.linkElements.each(function(d) {
        const group = d3.select(this);
        
        if (d.similarity !== undefined && d.similarity > 0 && !d.type) {
            // For similarity links (not manual links), we'll add dots in the ticked function
            group.attr('data-similarity', d.similarity);
        } else {
            // Regular solid line for manual links and tag links
            group.append('line')
                .attr('class', 'link solid-link')
                .attr('stroke', 'var(--text-muted)')
                .attr('stroke-opacity', 0.6)
                .attr('stroke-width', d.type === 'tag-link' ? 1 : 2)
                .attr('marker-end', d.type === 'tag-link' ? null : 'url(#arrow)');
        }
    });
}

private setupNodes() {
    this.g.selectAll('.nodes').remove();
    
    this.nodeElements = this.g.append('g')
        .attr('class', 'nodes')
        .selectAll<SVGGElement, GraphNode>('g')
        .data(this.nodes)
        .join('g')
        .attr('class', d => `node ${d.type || 'file'}`)
        .call(this.drag());

    // Add circles with size based on connections for tags
    this.nodeElements.append('circle')
        .attr('r', d => {
            if (d.type === 'tag' && d.connectionCount) {
                // Scale tag size based on connection count
                const minSize = this.plugin.settings.nodeSize * 0.8;
                const maxSize = this.plugin.settings.nodeSize * 2;
                const scaleFactor = Math.log(d.connectionCount + 1) / Math.log(10); // Logarithmic scaling
                return Math.min(maxSize, minSize + scaleFactor * 10);
            }
            return this.plugin.settings.nodeSize;
        })
        .attr('fill', d => {
            if (d.type === 'tag') {
                return 'var(--text-accent)';
            }
            return 'var(--text-muted)';
        })
        .attr('stroke', 'var(--background-primary)')
        .attr('stroke-width', 2)
        .attr('opacity', 1);

        // Add labels
        this.nodeElements.append('text')
            .text(d => d.name)
            .attr('x', 0)
            .attr('y', d => (d.type === 'tag' ? this.plugin.settings.nodeSize * 0.8 : this.plugin.settings.nodeSize) + 15)
            .attr('text-anchor', 'middle')
            .attr('class', 'node-label')
            .style('fill', 'var(--text-normal)')
            .style('font-size', d => d.type === 'tag' ? '11px' : '12px')
            .style('font-weight', d => d.type === 'tag' ? '600' : 'normal');

                // Add hover effects with relationship highlighting
        // Update the hover effects in setupNodes method:

        // Add hover effects with relationship highlighting
        this.nodeElements.on('mouseenter', (event, hoveredNode) => {
            // Build edge set as pairs: E = {(v1, v2) | v1, v2 are vertices}
            // Store edges that meet threshold and involve the hovered node
            const connectedEdges = new Set<string>();
            const connectedNodeIds = new Set<string>();
            connectedNodeIds.add(hoveredNode.id);
            
            this.links.forEach(link => {
                const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
                const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
                
                // Check if the link meets the similarity threshold (or is not a similarity link)
                const meetsThreshold = link.similarity != undefined && link.similarity > this.plugin.settings.similarityThreshold;
                
                if (meetsThreshold) {
                    // Create edge pair identifier
                    const edgePair = `${sourceId}|${targetId}`;
                    
                    // If hovered node is in this edge pair, mark edge as connected
                    if (sourceId === hoveredNode.id || targetId === hoveredNode.id) {
                        connectedEdges.add(edgePair);
                        // Also track connected nodes for styling
                        if (sourceId === hoveredNode.id) {
                            connectedNodeIds.add(targetId);
                        } else {
                            connectedNodeIds.add(sourceId);
                        }
                    }
                }
            });

            // Update node styling
            this.nodeElements.selectAll('circle')
                .transition()
                .duration(200)
                .attr('fill', function(d: GraphNode) {
                    if (d.id === hoveredNode.id) {
                        return 'var(--text-success)'; // Green for hovered node
                    } else if (connectedNodeIds.has(d.id)) {
                        // Use accent color for connected file nodes, keep tag nodes as accent
                        return d.type === 'tag' ? 'var(--text-accent)' : 'var(--interactive-accent)';
                    } else {
                        // Keep original color for unrelated nodes
                        return d.type === 'tag' ? 'var(--text-accent)' : 'var(--text-muted)';
                    }
                })
                .attr('opacity', (d: GraphNode) => {
                    if (d.id === hoveredNode.id || connectedNodeIds.has(d.id)) {
                        return 1;
                    } else {
                        return 0.3; // Reduced opacity for unrelated nodes
                    }
                });

            // Update link styling - highlight if edge pair contains hovered node
            this.linkElements.each(function(d: any) {
                const group = d3.select(this);
                const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
                const targetId = typeof d.target === 'string' ? d.target : d.target.id;
                const edgePair = `${sourceId}|${targetId}`;
                // An edge is highlighted if it's in our connected edges set
                const isConnected = connectedEdges.has(edgePair);
                
                // Update solid lines
                group.select('line')
                    .transition()
                    .duration(200)
                    .attr('stroke', isConnected ? 'var(--interactive-accent)' : 'var(--text-muted)') // Fixed: different colors
                    .attr('stroke-opacity', isConnected ? 0.8 : 0.2)
                    .attr('marker-end', (d: GraphLink) => {
                        if (d.type === 'tag-link') return null;
                        return isConnected ? 'url(#arrow-accent)' : 'url(#arrow)';
                    });
                
                // Update dots for similarity links
                group.selectAll('circle.link-dot')
                    .transition()
                    .duration(200)
                    .attr('fill', isConnected ? 'var(--interactive-accent)' : 'var(--text-muted)')
                    .attr('opacity', isConnected ? 0.8 : 0.2);
            });

            // Update text styling (opacity + size + vertical offset)
            this.nodeElements.selectAll('text')
                .transition()
                .duration(200)
                .style('opacity', (d: GraphNode) => (d.id === hoveredNode.id || connectedNodeIds.has(d.id)) ? 1 : 0.3)
                .style('font-size', (d: GraphNode) => {
                    const base = d.type === 'tag' ? 11 : 12;
                    const size = (d.id === hoveredNode.id) ? base * 1.2 : base;
                    return size + 'px';
                })
                .attr('y', (d: GraphNode) => {
                    const baseY = (d.type === 'tag' ? this.plugin.settings.nodeSize * 0.8 : this.plugin.settings.nodeSize) + 15;
                    return (d.id === hoveredNode.id) ? baseY + 12 : baseY; // shift hovered label slightly downward
                });
        })
        .on('mouseleave', () => {
            // Reset all styling
            this.nodeElements.selectAll('circle')
                .transition()
                .duration(200)
                .attr('fill', (d: GraphNode) => d.type === 'tag' ? 'var(--text-accent)' : 'var(--text-muted)')
                .attr('opacity', 1);

            // Reset link styling
            this.linkElements.each(function() {
                const group = d3.select(this);
                
                group.select('line')
                    .transition()
                    .duration(200)
                    .attr('stroke', 'var(--text-muted)')
                    .attr('stroke-opacity', 0.6)
                    .attr('marker-end', (d: GraphLink) => {
                        if (d.type === 'tag-link') return null;
                        return 'url(#arrow)';
                    });
                
                group.selectAll('circle.link-dot')
                    .transition()
                    .duration(200)
                    .attr('fill', 'var(--text-muted)')
                    .attr('opacity', 0.6);
            });

            this.nodeElements.selectAll('text')
                .transition()
                .duration(200)
                .style('opacity', 1)
                .style('font-size', (d: GraphNode) => d.type === 'tag' ? '11px' : '12px')
                .attr('y', (d: GraphNode) => (d.type === 'tag' ? this.plugin.settings.nodeSize * 0.8 : this.plugin.settings.nodeSize) + 10);
        });

        // Handle clicks
        this.nodeElements.on('click', async (event, d) => {
            event.stopPropagation();
            if (d.type !== 'tag') {
                const file = this.plugin.app.vault.getAbstractFileByPath(d.path);
                if (file instanceof TFile) {
                    await this.plugin.app.workspace.getLeaf().openFile(file);
                }
            }
        });

        // Update hover effects
    this.nodeElements.on('mouseenter', (event, hoveredNode) => {
        // Build edge set as pairs: E = {(v1, v2) | v1, v2 are vertices}
        // Store edges that meet threshold and involve the hovered node
        const connectedEdges = new Set<string>();
        const connectedNodeIds = new Set<string>();
        connectedNodeIds.add(hoveredNode.id);
        
        this.links.forEach(link => {
            const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
            const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
            
            // Check if the link meets the similarity threshold (or is not a similarity link)
            const meetsThreshold = link.similarity !== undefined && link.similarity > this.plugin.settings.similarityThreshold;
            
            if (meetsThreshold) {
                // Create edge pair identifier
                const edgePair = `${sourceId}|${targetId}`;
                
                // If hovered node is in this edge pair, mark edge as connected
                if (sourceId === hoveredNode.id || targetId === hoveredNode.id) {
                    connectedEdges.add(edgePair);
                    // Also track connected nodes for styling
                    if (sourceId === hoveredNode.id) {
                        connectedNodeIds.add(targetId);
                    } else {
                        connectedNodeIds.add(sourceId);
                    }
                }
            }
        });

        // Update node styling
        this.nodeElements.selectAll('circle')
            .transition()
            .duration(200)
            .attr('fill', function(d: GraphNode) {
                if (d.id === hoveredNode.id) {
                    return 'var(--text-success)';
                } else if (connectedNodeIds.has(d.id)) {
                    return d.type === 'tag' ? 'var(--text-accent)' : 'var(--text-muted)';
                } else {
                    return d.type === 'tag' ? 'var(--text-accent)' : 'var(--text-muted)';
                }
            })
            .attr('opacity', (d: GraphNode) => {
                if (d.id === hoveredNode.id || connectedNodeIds.has(d.id)) {
                    return 1;
                } else {
                    return 0.3;
                }
            });

        // Update link styling - highlight if edge pair contains hovered node
        this.linkElements.each(function(d: any) {
            const group = d3.select(this);
            const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
            const targetId = typeof d.target === 'string' ? d.target : d.target.id;
            const edgePair = `${sourceId}|${targetId}`;
            // An edge is highlighted if it's in our connected edges set
            const isConnected = connectedEdges.has(edgePair);
            
            // Update solid lines
            group.selectAll('line')
                .transition()
                .duration(200)
                .attr('stroke', isConnected ? 'var(--interactive-accent)' : 'var(--text-muted)')
                .attr('stroke-opacity', isConnected ? 0.8 : 0.2)
                .attr('marker-end', (d: GraphLink) => {
                    if (d.type === 'tag-link') return null;
                    return isConnected ? 'url(#arrow-accent)' : 'url(#arrow)';
                });
            
            // Update dots
            group.selectAll('circle')
                .transition()
                .duration(200)
                .attr('fill', isConnected ? 'var(--interactive-accent)' : 'var(--text-muted)')
                .attr('opacity', isConnected ? 1 : 0.2);
        });

        // Update text styling (opacity + size + vertical offset)
        this.nodeElements.selectAll('text')
            .transition()
            .duration(200)
            .style('opacity', (d: GraphNode) => (d.id === hoveredNode.id || connectedNodeIds.has(d.id)) ? 1 : 0.3)
            .style('font-size', (d: GraphNode) => {
                const base = d.type === 'tag' ? 11 : 12;
                const size = (d.id === hoveredNode.id) ? base * 1.2 : base;
                return size + 'px';
            })
            .attr('y', (d: GraphNode) => {
                const baseY = (d.type === 'tag' ? this.plugin.settings.nodeSize * 0.8 : this.plugin.settings.nodeSize) + 15;
                return (d.id === hoveredNode.id) ? baseY + 12 : baseY;
            });
    })
    .on('mouseleave', () => {
        // Reset all styling
        this.nodeElements.selectAll('circle')
            .transition()
            .duration(200)
            .attr('fill', (d: GraphNode) => d.type === 'tag' ? 'var(--text-accent)' : 'var(--text-muted)')
            .attr('opacity', 1);

        // Reset link styling
        this.linkElements.each(function() {
            const group = d3.select(this);
            
            group.select('line')
                .transition()
                .duration(200)
                .attr('stroke', 'var(--text-muted)')
                .attr('stroke-opacity', 0.6);
            
            group.selectAll('circle')
                .transition()
                .duration(200)
                .attr('fill', 'var(--text-muted)')
                .attr('opacity', 0.6);
        });

        this.nodeElements.selectAll('text')
            .transition()
            .duration(200)
            .style('opacity', 1)
            .style('font-size', (d: GraphNode) => d.type === 'tag' ? '11px' : '12px')
            .attr('y', (d: GraphNode) => (d.type === 'tag' ? this.plugin.settings.nodeSize * 0.8 : this.plugin.settings.nodeSize) + 15);
    });
}

    private setupZoom() {
        // Zoom is already set up in setupSVG, but let's enhance it
        this.zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
                
                // Handle text fading based on zoom level
                const zoomLevel = event.transform.k;
                const fadeThreshold = 0.7; // You can make this configurable
                this.nodeElements?.selectAll('text')
                    .style('opacity', zoomLevel < fadeThreshold ? 0 : 1);
            });

        this.svg.call(this.zoom);
    }
    private setupSVG() {
        // Clear any existing SVG
        d3.select(this.container).selectAll('*').remove();
        
        const width = this.container.clientWidth || 800;
        const height = this.container.clientHeight || 600;

        // Create SVG
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${width} ${height}`)
            .style('background', 'var(--background-primary)');

        // Add zoom behavior
        this.zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });

        this.svg.call(this.zoom);

        // Create main group
        this.g = this.svg.append('g');

        // Add arrow markers
        this.svg.append('defs').selectAll('marker')
            .data(['arrow'])
            .join('marker')
            .attr('id', 'arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('fill', 'var(--text-muted)')
            .attr('d', 'M0,-5L10,0L0,5');
    
    }

private setupSimulation() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;
    const centerX = width / 2;
    const centerY = height / 2;

    this.simulation = d3.forceSimulation<GraphNode>(this.nodes)
        .force('link', d3.forceLink<GraphNode, GraphLink>(this.links)
            .id(d => d.id)
            .distance(d => {
                if (d.similarity !== undefined) {
                    // Tighter distance range: at similarity=1 (identical), distance=0.5x base
                    // at similarity=0, distance=1.2x base (reduced max from 2x)
                    return this.plugin.settings.linkDistance * (1.2 - 0.7 * d.similarity);
                }
                return this.plugin.settings.linkDistance;
            })
            .strength(0.5))
        .force('charge', d3.forceManyBody()
            .strength((d: GraphNode) => {
                // Stronger repulsion for tag nodes based on their size
                if (d.type === 'tag' && d.connectionCount) {
                    return -this.plugin.settings.repulsionForce * (1 + Math.log(d.connectionCount + 1) / 3);
                }
                return -this.plugin.settings.repulsionForce;
            }))
        .force('center', d3.forceCenter(centerX, centerY)
            .strength(this.plugin.settings.centerForce))
        // Use forceX and forceY instead of radial to spread nodes better
        .force('x', d3.forceX(centerX).strength(0.05))
        .force('y', d3.forceY(centerY).strength(0.05))
        .force('collision', d3.forceCollide()
            .radius((d: GraphNode) => {
                if (d.type === 'tag' && d.connectionCount) {
                    const minSize = this.plugin.settings.nodeSize * 0.8;
                    const maxSize = this.plugin.settings.nodeSize * 2;
                    const scaleFactor = Math.log(d.connectionCount + 1) / Math.log(10);
                    return Math.min(maxSize, minSize + scaleFactor * 10) + 5;
                }
                return this.plugin.settings.nodeSize + 5;
            })
            .strength(0.7))
        .on('tick', () => this.ticked());

    // Apply initial positions in a grid to ensure good distribution
    const cols = Math.ceil(Math.sqrt(this.nodes.length));
    const cellWidth = width / cols;
    const cellHeight = height / cols;
    
    this.nodes.forEach((node, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        node.x = cellWidth * (col + 0.5) + (Math.random() - 0.5) * 20;
        node.y = cellHeight * (row + 0.5) + (Math.random() - 0.5) * 20;
    });

    this.simulation.alpha(1).restart();
}

    updateForces() {
        const width = this.container.clientWidth || 800;
        const height = this.container.clientHeight || 600;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.4;
            
        if (this.simulation) {
            (this.simulation.force('charge') as d3.ForceManyBody<GraphNode>)
                ?.strength(-this.plugin.settings.repulsionForce);
            
            (this.simulation.force('center') as d3.ForceCenter<GraphNode>)
                ?.strength(this.plugin.settings.centerForce);
            
            (this.simulation.force('link') as d3.ForceLink<GraphNode, GraphLink>)
                ?.distance(d => {
                    if (d.similarity !== undefined) {
                        // Tighter distance range: at similarity=1, distance=0.5x base; at similarity=0, distance=1.2x base
                        return this.plugin.settings.linkDistance * (1.2 - 0.7 * d.similarity);
                    }
                    return this.plugin.settings.linkDistance;
                });
            
            // Update radial force
            (this.simulation.force('radial') as d3.ForceRadial<GraphNode>)
                ?.radius(radius);

            this.simulation.alpha(0.3).restart();
        }
    }

    private drag() {
        return d3.drag<SVGGElement, GraphNode>()
            .on('start', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0);
                // Keep the node fixed after dragging
                // Remove these lines if you want nodes to be free after dragging
                // d.fx = null;
                // d.fy = null;
            });
    }

    private render() {
        // Render links
        this.linkElements = this.g.append('g')
            .attr('class', 'links')
            .selectAll<SVGLineElement, GraphLink>('line')
            .data(this.links)
            .join('line')
            .attr('stroke', d => {
                if (d.similarity !== undefined) {
                    const hue = d.similarity * 120;
                    return `hsl(${hue}, 50%, 50%)`;
                }
                return 'var(--text-muted)';
            })
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', d => d.thickness || this.plugin.settings.defaultLinkThickness);

        // Render nodes
        const node = this.g.append('g')
            .attr('class', 'nodes')
            .selectAll<SVGGElement, GraphNode>('g')
            .data(this.nodes)
            .join('g')
            .attr('class', 'node')
            .call(this.drag() as any);

        // Add circles
        node.append('circle')
            .attr('r', this.plugin.settings.nodeSize)
            .attr('fill', d => d.embedding ? 'var(--interactive-accent)' : 'var(--text-accent)')
            .attr('stroke', 'var(--background-primary)')
            .attr('stroke-width', 2);

        // Add labels
        node.append('text')
            .text(d => d.name)
            .attr('x', 0)
            .attr('y', -this.plugin.settings.nodeSize - 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', 'var(--text-normal)')
            .attr('class', 'node-label');

        // Add hover effects
        node.on('mouseenter', (event, d) => {
            d3.select(event.currentTarget).select('circle')
                .transition()
                .duration(200)
                .attr('r', this.plugin.settings.nodeSize * 1.2);
        })
        .on('mouseleave', (event, d) => {
            d3.select(event.currentTarget).select('circle')
                .transition()
                .duration(200)
                .attr('r', this.plugin.settings.nodeSize);
        });

        // Handle clicks
        node.on('click', async (event, d) => {
            event.stopPropagation();
            const file = this.plugin.app.vault.getAbstractFileByPath(d.path);
            if (file instanceof TFile) {
                await this.plugin.app.workspace.getLeaf().openFile(file);
            }
        });

        this.nodeElements = node;
    }

private ticked() {
    // Update link positions
    const similarityThreshold = this.plugin.settings.similarityThreshold;
    this.linkElements.each(function(d: any) {
        const group = d3.select(this);
        const source = d.source as GraphNode;
        const target = d.target as GraphNode;
        
        // Update solid lines
        group.select('line.solid-link')
            .attr('x1', source.x!)
            .attr('y1', source.y!)
            .attr('x2', target.x!)
            .attr('y2', target.y!);
        
        // Handle dotted lines for similarity links
        const similarity = group.attr('data-similarity');
        if (similarity) {
            const sim = parseFloat(similarity);
            const dx = target.x! - source.x!;
            const dy = target.y! - source.y!;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const dotRadius = 1.5;
            // Spacing inversely proportional to similarity above threshold: higher similarity = tighter spacing
            const spacing = Math.min(1 / (sim - similarityThreshold), 30); // make it a bit loosen
            
            // Remove old dots
            group.selectAll('circle').remove();
            
            // Create new dots
            const numDots = Math.floor(distance / spacing);
            if (numDots > 1) {
                for (let i = 1; i < numDots; i++) {
                    const t = i / numDots;
                    group.append('circle')
                        .attr('class', 'link-dot')
                        .attr('cx', source.x! + dx * t)
                        .attr('cy', source.y! + dy * t)
                        .attr('r', dotRadius)
                        .attr('fill', 'var(--text-muted)')
                        .attr('opacity', 0.6);
                }
            }
        }
    });
    
    // Update node positions
    this.nodeElements.attr('transform', d => `translate(${d.x},${d.y})`);
}

    // Add these methods to GraphRenderer class:

    applyNodeVisibility() {
        // Update node visibility
        this.nodeElements
            .style('display', d => d.hidden ? 'none' : 'block');
        
        // Update link visibility
        this.linkElements
            .style('display', d => {
                const source = typeof d.source === 'string' ? d.source : (d.source as GraphNode).id;
                const target = typeof d.target === 'string' ? d.target : (d.target as GraphNode).id;
                const sourceNode = this.nodes.find(n => n.id === source);
                const targetNode = this.nodes.find(n => n.id === target);
                return (sourceNode?.hidden || targetNode?.hidden) ? 'none' : 'block';
            });
    }

    toggleArrows(showArrows: boolean) {
        this.linkElements
            .attr('marker-end', showArrows ? 'url(#arrow)' : null);
    }

    setTextFadeThreshold(threshold: number) {
        // Implement text fading based on zoom level
        const svgNode = this.svg.node();
        if (!svgNode) return;
        const currentZoom = d3.zoomTransform(svgNode).k;
        this.nodeElements.selectAll('text')
            .style('opacity', currentZoom < threshold ? 0 : 1);
    }

    // Add or update this method in the GraphRenderer class:

updateNodeSize(size: number) {
    // Only update file nodes, not tag nodes
    this.nodeElements?.selectAll('circle')
        .attr('r', (d: GraphNode) => {
            if (d.type === 'tag' && d.connectionCount) {
                // Keep tag size based on connections, don't change it
                const minSize = this.plugin.settings.nodeSize * 0.8;
                const maxSize = this.plugin.settings.nodeSize * 2;
                const scaleFactor = Math.log(d.connectionCount + 1) / Math.log(10);
                return Math.min(maxSize, minSize + scaleFactor * 10);
            } else if (d.type === 'tag') {
                // Default tag size (unchanged)
                return this.plugin.settings.nodeSize * 0.8;
            } else {
                // File nodes - apply the new size
                return size;
            }
        });
    
    // Update collision force to account for new sizes
    if (this.simulation) {
        (this.simulation.force('collision') as d3.ForceCollide<GraphNode>)
            ?.radius(d => {
                if (d.type === 'tag' && d.connectionCount) {
                    const minSize = this.plugin.settings.nodeSize * 0.8;
                    const maxSize = this.plugin.settings.nodeSize * 2;
                    const scaleFactor = Math.log(d.connectionCount + 1) / Math.log(10);
                    return Math.min(maxSize, minSize + scaleFactor * 10) + 5;
                } else if (d.type === 'tag') {
                    return this.plugin.settings.nodeSize * 0.8 + 5;
                } else {
                    return size + 5;
                }
            });
        
        this.simulation.alpha(0.3).restart();
    }
}
    updateLinkThickness(thickness: number) {
        this.linkElements
            .attr('stroke-width', d => d.thickness || thickness);
    }

    updateLinkForce(strength: number) {
        this.simulation.force('link', d3.forceLink<GraphNode, GraphLink>(this.links)
            .id(d => d.id)
            .distance(this.plugin.settings.linkDistance)
            .strength(strength));
        this.simulation.alpha(0.3).restart();
    }

    toggleAnimation(animate: boolean) {
        this.isAnimating = animate;
        if (animate) {
            this.simulation.restart();
        } else {
            this.simulation.stop();
        }
    }

    resize() {
        const width = this.container.clientWidth || 800;
        const height = this.container.clientHeight || 600;
        
        if (this.svg) {
            this.svg.attr('viewBox', `0 0 ${width} ${height}`);
        }
        
        if (this.simulation) {
            this.simulation.force('center', d3.forceCenter(width / 2, height / 2));
            this.simulation.alpha(0.3).restart();
        }
    }

    destroy() {
        if (this.simulation) {
            this.simulation.stop();
        }
        if (this.svg) {
            this.svg.remove();
        }
    }
}