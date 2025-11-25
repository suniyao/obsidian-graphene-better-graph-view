import { setIcon } from 'obsidian';
import type CombinedPlugin from './main';
import type { BetterGraphView } from './GraphView';

export class GraphControls {
    private container: HTMLElement;
    private plugin: CombinedPlugin;
    private view: BetterGraphView;
    private isAnimating: boolean = true;
    
    // Filter states
    private filters = {
        showTags: false,
        showAttachments: false,
        existingFilesOnly: true,
        showOrphans: true,
        searchQuery: ''
    };

    constructor(container: HTMLElement, plugin: CombinedPlugin, view: BetterGraphView) {
        this.container = container;
        this.plugin = plugin;
        this.view = view;
        this.render();
    }

    private render() {
        this.container.empty();
        this.container.addClass('graph-controls');

        // Filters section
        const filtersSection = this.createSection('Filters', true);
        
        // Search
        const searchContainer = filtersSection.createDiv('search-container');
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search files...',
            cls: 'search-input'
        });
        const searchIcon = searchContainer.createDiv('search-icon');
        setIcon(searchIcon, 'search');
        
        searchInput.addEventListener('input', (e) => {
            this.filters.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
            this.applyFilters();
        });

        // Toggles with actual functionality
        this.createToggle(filtersSection, 'Tags', this.filters.showTags, async (enabled) => {
            this.filters.showTags = enabled;
            this.view.filters.showTags = enabled;
            await this.view.refresh();
        });
        
        this.createToggle(filtersSection, 'Attachments', this.filters.showAttachments, async (enabled) => {
            this.filters.showAttachments = enabled;
            this.view.filters.showAttachments = enabled;
            await this.view.refresh();
        });
        
        this.createToggle(filtersSection, 'Existing files only', this.filters.existingFilesOnly, (enabled) => {
            this.filters.existingFilesOnly = enabled;
            this.applyFilters();
        });
        
        this.createToggle(filtersSection, 'Orphans', this.filters.showOrphans, (enabled) => {
            this.filters.showOrphans = enabled;
            this.applyFilters();
        });

        // Groups section
        const groupsSection = this.createSection('Groups');
        const newGroupBtn = groupsSection.createEl('button', {
            text: 'New group',
            cls: 'mod-cta full-width'
        });

        // Display section
        const displaySection = this.createSection('Display');
        
        this.createToggle(displaySection, 'Arrows', false, (enabled) => {
            // Toggle arrow markers on links
            if (this.view.renderer) {
                this.view.renderer.toggleArrows(enabled);
            }
        });
        
        this.createSlider(displaySection, 'Text fade threshold', 0, 1, 0.1, 0.5, (value) => {
            if (this.view.renderer) {
                this.view.renderer.setTextFadeThreshold(value);
            }
        });
        
        this.createSlider(displaySection, 'Node size', 
            5, 30, 1, this.plugin.settings.nodeSize,
            (value) => {
                this.plugin.settings.nodeSize = value;
                this.plugin.saveSettings();
                if (this.view.renderer) {
                    this.view.renderer.updateNodeSize(value);
                }
            }
        );
        
        this.createSlider(displaySection, 'Link thickness',
            0.5, 5, 0.5, this.plugin.settings.defaultLinkThickness,
            (value) => {
                this.plugin.settings.defaultLinkThickness = value;
                this.plugin.saveSettings();
                if (this.view.renderer) {
                    this.view.renderer.updateLinkThickness(value);
                }
            }
        );

        // Animate button
        const animateBtn = displaySection.createEl('button', {
            text: this.isAnimating ? 'Stop animation' : 'Animate',
            cls: this.isAnimating ? 'mod-warning full-width' : 'mod-cta full-width'
        });
        animateBtn.addEventListener('click', () => {
            this.isAnimating = !this.isAnimating;
            animateBtn.textContent = this.isAnimating ? 'Stop animation' : 'Animate';
            animateBtn.className = this.isAnimating ? 'mod-warning full-width' : 'mod-cta full-width';
            if (this.view.renderer) {
                this.view.renderer.toggleAnimation(this.isAnimating);
            }
        });

        // Forces section
        const forcesSection = this.createSection('Forces');
        
        this.createSlider(forcesSection, 'Center force',
            0, 1, 0.05, this.plugin.settings.centerForce,
            (value) => {
                this.plugin.settings.centerForce = value;
                this.plugin.saveSettings();
                if (this.view.renderer) {
                    this.view.renderer.updateForces();
                }
            }
        );
        
        this.createSlider(forcesSection, 'Repel force',
            100, 1000, 50, this.plugin.settings.repulsionForce,
            (value) => {
                this.plugin.settings.repulsionForce = value;
                this.plugin.saveSettings();
                if (this.view.renderer) {
                    this.view.renderer.updateForces();
                }
            }
        );
        
        this.createSlider(forcesSection, 'Link force',
            0, 1, 0.05, 0.5, (value) => {
                if (this.view.renderer) {
                    this.view.renderer.updateLinkForce(value);
                }
            });
        
        this.createSlider(forcesSection, 'Link distance',
            20, 200, 10, this.plugin.settings.linkDistance,
            (value) => {
                this.plugin.settings.linkDistance = value;
                this.plugin.saveSettings();
                if (this.view.renderer) {
                    this.view.renderer.updateForces();
                }
            }
        );

        // Update file count
        this.updateFileCount();
    }

    private updateFileCount() {
        const fileCountEl = this.container.querySelector('.file-count');
        if (fileCountEl) {
            const visibleNodes = this.view.nodes.filter(node => !node.hidden);
            const visibleLinks = this.view.links.filter(link => {
                const source = typeof link.source === 'string' ? link.source : (link.source as any).id;
                const target = typeof link.target === 'string' ? link.target : (link.target as any).id;
                const sourceNode = this.view.nodes.find(n => n.id === source);
                const targetNode = this.view.nodes.find(n => n.id === target);
                return sourceNode && targetNode && !sourceNode.hidden && !targetNode.hidden;
            });
            fileCountEl.setText(`${visibleNodes.length} files, ${visibleLinks.length} links`);
        } else {
            // Create file count if it doesn't exist
            const forcesSection = this.container.querySelector('.control-section:last-child .section-content');
            if (forcesSection) {
                const fileCount = forcesSection.createDiv('file-count');
                const visibleNodes = this.view.nodes.filter(node => !node.hidden);
                const visibleLinks = this.view.links.filter(link => {
                    const source = typeof link.source === 'string' ? link.source : (link.source as any).id;
                    const target = typeof link.target === 'string' ? link.target : (link.target as any).id;
                    const sourceNode = this.view.nodes.find(n => n.id === source);
                    const targetNode = this.view.nodes.find(n => n.id === target);
                    return sourceNode && targetNode && !sourceNode.hidden && !targetNode.hidden;
                });
                fileCount.setText(`${visibleNodes.length} files, ${visibleLinks.length} links`);
            }
        }
    }

    private applyFilters() {
        // Get all files to check orphan status
        const linkedFiles = new Set<string>();
        
        // Collect all linked files
        this.view.links.forEach(link => {
            const source = typeof link.source === 'string' ? link.source : (link.source as any).id;
            const target = typeof link.target === 'string' ? link.target : (link.target as any).id;
            linkedFiles.add(source);
            linkedFiles.add(target);
        });

        // Apply filters to nodes
        this.view.nodes.forEach(node => {
            let shouldShow = true;

            // Search filter
            if (this.filters.searchQuery && !node.name.toLowerCase().includes(this.filters.searchQuery)) {
                shouldShow = false;
            }

            // Check node type
            if (node.type === 'tag') {
                shouldShow = shouldShow && this.filters.showTags;
            } else if (node.type === 'attachment') {
                shouldShow = shouldShow && this.filters.showAttachments;
            } else {
                // File nodes
                const file = this.plugin.app.vault.getAbstractFileByPath(node.path);
                if (file) {
                    // Check orphan status for markdown files
                    const isOrphan = !linkedFiles.has(node.id);
                    if (isOrphan && !this.filters.showOrphans) {
                        shouldShow = false;
                    }
                } else if (this.filters.existingFilesOnly) {
                    // File doesn't exist
                    shouldShow = false;
                }
            }

            node.hidden = !shouldShow;
        });

        // Update the graph visualization
        if (this.view.renderer) {
            this.view.renderer.applyNodeVisibility();
        }

        // Update file count
        this.updateFileCount();
    }

    private createSection(title: string, expanded: boolean = false): HTMLElement {
        const section = this.container.createDiv('control-section');
        const header = section.createDiv('section-header');
        
        const toggle = header.createDiv('section-toggle');
        setIcon(toggle, expanded ? 'chevron-down' : 'chevron-right');
        
        header.createSpan({ text: title, cls: 'section-title' });
        
        const content = section.createDiv('section-content');
        content.style.display = expanded ? 'block' : 'none';
        
        header.addEventListener('click', () => {
            const isExpanded = content.style.display === 'block';
            content.style.display = isExpanded ? 'none' : 'block';
            setIcon(toggle, isExpanded ? 'chevron-right' : 'chevron-down');
        });
        
        return content;
    }

    private createToggle(parent: HTMLElement, label: string, checked: boolean, onChange?: (enabled: boolean) => void | Promise<void>): HTMLElement {
        const container = parent.createDiv('toggle-container');
        container.createEl('label', { text: label });
        const toggle = container.createDiv('toggle');
        toggle.classList.toggle('is-enabled', checked);
        
        toggle.addEventListener('click', async () => {
            const isEnabled = !toggle.classList.contains('is-enabled');
            toggle.classList.toggle('is-enabled', isEnabled);
            if (onChange) {
                await onChange(isEnabled);
            }
        });
        
        return container;
    }

    private createSlider(
        parent: HTMLElement,
        label: string,
        min: number,
        max: number,
        step: number,
        value: number,
        onChange?: (value: number) => void
    ): HTMLElement {
        const container = parent.createDiv('slider-container');
        container.createEl('label', { text: label });
        
        const sliderWrapper = container.createDiv('slider-wrapper');
        const slider = sliderWrapper.createEl('input', {
            type: 'range',
            attr: { min: min.toString(), max: max.toString(), step: step.toString() }
        }) as HTMLInputElement;
        slider.value = value.toString();
        
        const valueDisplay = container.createDiv('slider-value');
        valueDisplay.setText(value.toFixed(step < 1 ? 2 : 0));
        
        if (onChange) {
            slider.addEventListener('input', (e) => {
                const newValue = parseFloat((e.target as HTMLInputElement).value);
                valueDisplay.setText(newValue.toFixed(step < 1 ? 2 : 0));
                onChange(newValue);
            });
        }
        
        return container;
    }
}