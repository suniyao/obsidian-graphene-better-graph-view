import { App, Modal, TFile } from 'obsidian';
import * as d3 from 'd3';
import type BetterGraphPlugin from './main';
import { GraphNode, GraphLink } from './types';

export class BetterGraphModal extends Modal {
    plugin: BetterGraphPlugin;
    nodes: GraphNode[] = [];
    links: GraphLink[] = [];
    simulation: d3.Simulation<GraphNode, GraphLink>;
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;

    constructor(app: App, plugin: BetterGraphPlugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('better-graph-view');

        // Create container
        const container = contentEl.createDiv({ cls: 'graph-container' });
        
        // Create controls
        const controls = contentEl.createDiv({ cls: 'graph-controls' });
        this.createControls(controls);

        // Build graph data
        await this.buildGraphData();

        // Create graph
        this.createGraph(container);
    }

    createControls(container: HTMLElement) {
        // Create control panel
        const controlPanel = container.createDiv({ cls: 'control-panel' });
        
        // Center graph button
        const centerBtn = controlPanel.createEl('button', { 
            text: 'Center Graph',
            cls: 'mod-cta'
        });
        centerBtn.onclick = () => this.centerGraph();

        // Reset zoom button
        const resetBtn = controlPanel.createEl('button', { 
            text: 'Reset Zoom',
            cls: 'mod-cta'
        });
        resetBtn.onclick = () => this.resetZoom();

        // Link thickness controls
        const thicknessPanel = container.createDiv({ cls: 'thickness-panel' });
        thicknessPanel.createEl('h3', { text: 'Link Thickness' });

        // Add thickness control for each link
        this.links.forEach(link => {
            const linkId = link.id;
            const currentThickness = this.plugin.settings.linkThickness[linkId] || this.plugin.settings.defaultLinkThickness;
            
            const control = thicknessPanel.createDiv({ cls: 'thickness-control' });
            control.createEl('label', { 
                text: `${link.source} → ${link.target}`,
                cls: 'thickness-label'
            });
            
            const slider = control.createEl('input', {
                type: 'range',
                cls: 'thickness-slider'
            }) as HTMLInputElement;
            slider.min = '0.5';
            slider.max = '5';
            slider.step = '0.5';
            slider.value = currentThickness.toString();
            
            const value = control.createEl('span', { 
                text: currentThickness.toString(),
                cls: 'thickness-value'
            });

            slider.oninput = (e) => {
                const newThickness = parseFloat((e.target as HTMLInputElement).value);
                this.plugin.settings.linkThickness[linkId] = newThickness;
                this.plugin.saveSettings();
                value.textContent = newThickness.toString();
                this.updateLinkThickness(linkId, newThickness);
            };
        });
    }

    async buildGraphData() {
        const files = this.app.vault.getMarkdownFiles();
        const nodeMap = new Map<string, GraphNode>();
        const linkSet = new Set<string>();

        // Create nodes
        files.forEach(file => {
            nodeMap.set(file.path, {
                id: file.path,
                name: file.basename,
                path: file.path,
                x: Math.random() * 700 + 50,
                y: Math.random() * 500 + 50,
                vx: 0,
                vy: 0
            });
        });

        // Create links
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.links) {
                for (const link of cache.links) {
                    const targetFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
                    if (targetFile && nodeMap.has(targetFile.path)) {
                        const linkId = `${file.path}->${targetFile.path}`;
                        if (!linkSet.has(linkId)) {
                            linkSet.add(linkId);
                            this.links.push({
                                source: file.path,
                                target: targetFile.path,
                                id: linkId
                            });
                        }
                    }
                }
            }
        }

        this.nodes = Array.from(nodeMap.values());
    }

    createGraph(container: HTMLElement) {
        const width = container.clientWidth || 800;
        const height = 600;

        // Create SVG
        this.svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', [0, 0, width, height])
            .attr('class', 'graph-svg');

        // Add zoom behavior
        const g = this.svg.append('g');
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });
        this.svg.call(zoom);

        // Create arrow markers for directed links
        this.svg.append('defs').selectAll('marker')
            .data(['arrow'])
            .join('marker')
            .attr('id', d => d)
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 15)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('fill', 'var(--text-muted)')
            .attr('d', 'M0,-5L10,0L0,5');

        // Initialize nodes in a better layout
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.35;

        // Initialize nodes in a circle
        this.nodes.forEach((node, i) => {
            const angle = (i / this.nodes.length) * 2 * Math.PI;
            node.x = centerX + radius * Math.cos(angle);
            node.y = centerY + radius * Math.sin(angle);
            node.vx = 0;
            node.vy = 0;
        });

        // Create better force simulation
        this.simulation = d3.forceSimulation<GraphNode>(this.nodes)
            .force('link', d3.forceLink<GraphNode, GraphLink>(this.links)
                .id(d => d.id)
                .distance(this.plugin.settings.linkDistance)
                .strength(0.5))
            .force('charge', d3.forceManyBody()
                .strength(-this.plugin.settings.repulsionForce)
                .distanceMax(300))
            .force('center', d3.forceCenter(centerX, centerY)
                .strength(this.plugin.settings.centerForce))
            .force('collision', d3.forceCollide<GraphNode>()
                .radius(this.plugin.settings.nodeSize + 5)
                .strength(0.7))
            .force('x', d3.forceX(centerX).strength(0.01))
            .force('y', d3.forceY(centerY).strength(0.01));

        // Configure simulation parameters
        this.simulation
            .velocityDecay(0.65)
            .alphaMin(0.001)
            .alphaDecay(0.02);

        // Create links
        const link = g.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(this.links)
            .join('line')
            .attr('class', 'graph-link')
            .attr('stroke', 'var(--text-muted)')
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', d => this.plugin.settings.linkThickness[d.id] || this.plugin.settings.defaultLinkThickness)
            .attr('marker-end', 'url(#arrow)');

        // Create nodes
        const node = g.append('g')
            .attr('class', 'nodes')
            .selectAll('g')
            .data(this.nodes)
            .join('g')
            .attr('class', 'graph-node')
            .call(this.drag());

        // Add circles to nodes
        node.append('circle')
            .attr('r', this.plugin.settings.nodeSize)
            .attr('fill', 'var(--text-accent)')
            .attr('stroke', 'var(--background-primary)')
            .attr('stroke-width', 2);

        // Add labels to nodes
        node.append('text')
            .text(d => d.name)
            .attr('x', 0)
            .attr('y', -this.plugin.settings.nodeSize - 5)
            .attr('text-anchor', 'middle')
            .attr('class', 'node-label')
            .style('fill', 'var(--text-normal)')
            .style('font-size', '12px');

        // Add hover effects
        node.on('mouseenter', function(event, d) {
            d3.select(this).select('circle')
                .transition()
                .duration(200)
                .attr('r', 15);
        }).on('mouseleave', function(event, d) {
            d3.select(this).select('circle')
                .transition()
                .duration(200)
                .attr('r', 12);
        });

        // Handle node clicks
        node.on('click', (event, d) => {
            event.stopPropagation();
            const file = this.app.vault.getAbstractFileByPath(d.path);
            if (file instanceof TFile) {
                this.app.workspace.getLeaf().openFile(file);
                this.close();
            }
        });

        // Update positions on tick
        this.simulation.on('tick', () => {
            link
                .attr('x1', d => (d.source as any).x!)
                .attr('y1', d => (d.source as any).y!)
                .attr('x2', d => (d.target as any).x!)
                .attr('y2', d => (d.target as any).y!);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });
    }

    drag() {
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
                // Optional: uncomment to release fixed position after drag
                // d.fx = null;
                // d.fy = null;
            });
    }

    centerGraph() {
        const width = this.svg.node()!.clientWidth;
        const height = this.svg.node()!.clientHeight;
        
        // Get current transform
        const currentTransform = d3.zoomTransform(this.svg.node()!);
        
        // Reset positions
        this.simulation.nodes().forEach(node => {
            node.fx = null;
            node.fy = null;
        });
        
        // Update center force
        this.simulation.force('center', d3.forceCenter(width / 2, height / 2).strength(0.5));
        this.simulation.alpha(0.5).restart();
        
        // Gradually reduce center force
        setTimeout(() => {
            this.simulation.force('center', d3.forceCenter(width / 2, height / 2).strength(this.plugin.settings.centerForce));
        }, 1000);
    }

    updateLinkThickness(linkId: string, thickness: number) {
        this.svg.selectAll('.graph-link')
            .filter((d: any) => d.id === linkId)
            .attr('stroke-width', thickness);
    }

    resetZoom() {
        this.svg.transition().duration(750).call(
            d3.zoom<SVGSVGElement, unknown>().transform,
            d3.zoomIdentity
        );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        if (this.simulation) {
            this.simulation.stop();
        }
    }
}