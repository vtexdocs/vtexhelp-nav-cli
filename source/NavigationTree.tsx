import React, { useState, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { Navigation, NavigationNode, Language } from './types/navigation.js';
import { getNavigationStats } from './services/navigationService.js';

interface NavigationTreeProps {
  navigation: Navigation;
  initialLanguage: string;
}

interface FlatItem {
  id: string;
  name: string;
  type: 'section' | 'category' | 'document';
  depth: number;
  hasChildren: boolean;
  childCount: number;
  path: string[];
  sectionName: string;
}

export const NavigationTree: React.FC<NavigationTreeProps> = ({ navigation, initialLanguage }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [currentLanguage, setCurrentLanguage] = useState<Language>(
    initialLanguage.toLowerCase() === 'es' ? Language.ES :
    initialLanguage.toLowerCase() === 'pt' ? Language.PT :
    Language.EN
  );
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const { exit } = useApp();

  // Calculate statistics
  const stats = useMemo(() => getNavigationStats(navigation), [navigation]);

  // Flatten the navigation structure
  const items = useMemo(() => {
    const flatItems: FlatItem[] = [];

    navigation.navbar.forEach((section, sectionIndex) => {
      const sectionId = `section-${sectionIndex}`;
      const sectionName = section.name[currentLanguage];
      
      flatItems.push({
        id: sectionId,
        name: sectionName,
        type: 'section',
        depth: 0,
        hasChildren: section.categories.length > 0,
        childCount: section.categories.length,
        path: [sectionName],
        sectionName: sectionName
      });

      if (expandedItems.has(sectionId)) {
        const processNode = (
          node: NavigationNode, 
          parentId: string, 
          depth: number, 
          path: string[]
        ) => {
          const nodeSlug = typeof node.slug === 'string' 
            ? node.slug 
            : node.slug[currentLanguage];
          const nodeId = `${parentId}/${nodeSlug}`;
          const nodeName = node.name[currentLanguage];
          const nodePath = [...path, nodeName];
          
          flatItems.push({
            id: nodeId,
            name: nodeName,
            type: node.type === 'category' ? 'category' : 'document',
            depth,
            hasChildren: node.children && node.children.length > 0,
            childCount: node.children ? node.children.length : 0,
            path: nodePath,
            sectionName: sectionName
          });

          if (expandedItems.has(nodeId) && node.children) {
            node.children.forEach(child => {
              processNode(child, nodeId, depth + 1, nodePath);
            });
          }
        };

        section.categories.forEach(category => {
          processNode(category, sectionId, 1, [sectionName]);
        });
      }
    });

    return flatItems;
  }, [navigation, expandedItems, currentLanguage]);

  // Handle terminal size for scrolling
  const terminalHeight = process.stdout.rows || 30;
  const reservedLines = showHelp ? 20 : showStats ? 12 : 8; // Reserve space for panels
  const maxVisibleItems = Math.max(5, terminalHeight - reservedLines);
  const scrollOffset = Math.max(0, Math.min(selectedIndex - maxVisibleItems + 1, items.length - maxVisibleItems));
  const visibleItems = items.slice(scrollOffset, scrollOffset + maxVisibleItems);

  useInput((input: string, key: any) => {
    // Navigation
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(items.length - 1, prev + 1));
    } else if (key.pageUp) {
      setSelectedIndex(prev => Math.max(0, prev - 10));
    } else if (key.pageDown) {
      setSelectedIndex(prev => Math.min(items.length - 1, prev + 10));
    }

    // Expand/Collapse
    if (key.return || input === ' ') {
      const selectedItem = items[selectedIndex];
      if (selectedItem && selectedItem.hasChildren) {
        setExpandedItems(prev => {
          const newSet = new Set(prev);
          if (newSet.has(selectedItem.id)) {
            // Collapse this item and all its children
            items.forEach(item => {
              if (item.id.startsWith(selectedItem.id)) {
                newSet.delete(item.id);
              }
            });
          } else {
            newSet.add(selectedItem.id);
          }
          return newSet;
        });
      }
    }

    // Expand/Collapse All
    if (input === 'a') {
      if (expandedItems.size > 0) {
        setExpandedItems(new Set());
      } else {
        const allExpandable = items
          .filter(item => item.hasChildren)
          .map(item => item.id);
        setExpandedItems(new Set(allExpandable));
      }
    }

    // Language switching
    if (input === 'e') {
      setCurrentLanguage(Language.EN);
    } else if (input === 's') {
      setCurrentLanguage(Language.ES);
    } else if (input === 'p') {
      setCurrentLanguage(Language.PT);
    }

    // Toggle help
    if (input === 'h' || input === '?') {
      setShowHelp(prev => !prev);
      setShowStats(false);
    }

    // Toggle stats
    if (input === 'i') {
      setShowStats(prev => !prev);
      setShowHelp(false);
    }

    // Quit
    if (input === 'q' || key.escape) {
      exit();
    }
  });

  const selectedItem = items[selectedIndex];

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box 
        borderStyle="round" 
        borderColor="cyan" 
        paddingX={1}
        marginBottom={1}
      >
        <Text bold color="cyan">VTEX Navigation Tree</Text>
        <Text color="gray"> │ </Text>
        <Text color="yellow">{currentLanguage.toUpperCase()}</Text>
        <Text color="gray"> │ </Text>
        <Text color="green">{items.length} items</Text>
        {selectedItem && (
          <>
            <Text color="gray"> │ </Text>
            <Text color="magenta">{selectedItem.sectionName}</Text>
          </>
        )}
      </Box>

      {/* Tree view */}
      <Box flexDirection="column" height={maxVisibleItems}>
        {visibleItems.map((item, visualIndex) => {
          const actualIndex = scrollOffset + visualIndex;
          const isSelected = actualIndex === selectedIndex;
          const isExpanded = expandedItems.has(item.id);
          const indent = '  '.repeat(item.depth);
          
          let icon = '';
          if (item.type === 'section') {
            icon = item.hasChildren ? (isExpanded ? '📂 ' : '📁 ') : '📄 ';
          } else if (item.type === 'category') {
            icon = item.hasChildren ? (isExpanded ? '▼ ' : '▶ ') : '• ';
          } else {
            icon = '📄 ';
          }
          
          const color = isSelected ? 'cyan' : 
                       item.type === 'section' ? 'yellow' :
                       item.type === 'document' ? 'green' : 'white';

          const itemText = item.hasChildren 
            ? `${item.name} (${item.childCount})`
            : item.name;

          return (
            <Box key={item.id}>
              <Text color={isSelected ? 'cyan' : 'gray'}>
                {isSelected ? '▶' : ' '}
              </Text>
              <Text color={color}>
                {' '}{indent}{icon}{itemText}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Scroll indicator */}
      {items.length > maxVisibleItems && !showHelp && !showStats && (
        <Box marginTop={1}>
          <Text color="gray">
            [{scrollOffset + 1}-{Math.min(scrollOffset + maxVisibleItems, items.length)} of {items.length}]
          </Text>
        </Box>
      )}

      {/* Help panel */}
      {showHelp && (
        <Box borderStyle="single" borderColor="yellow" padding={1} marginTop={1} flexDirection="column">
          <Text bold color="yellow">Keyboard Shortcuts</Text>
          <Text> </Text>
          <Box flexDirection="row">
            <Box flexDirection="column" marginRight={2}>
              <Text color="cyan">Navigation:</Text>
              <Text>  ↑/↓     Navigate items</Text>
              <Text>  PgUp/Dn Navigate faster</Text>
              <Text>  Space   Expand/collapse</Text>
              <Text>  a       Toggle all</Text>
            </Box>
            <Box flexDirection="column" marginRight={2}>
              <Text color="cyan">Language:</Text>
              <Text>  e  English</Text>
              <Text>  s  Spanish</Text>
              <Text>  p  Portuguese</Text>
            </Box>
            <Box flexDirection="column">
              <Text color="cyan">Other:</Text>
              <Text>  h/?  Toggle help</Text>
              <Text>  i    Toggle stats</Text>
              <Text>  q    Quit</Text>
            </Box>
          </Box>
          <Text> </Text>
          <Text color="gray">Press h to close help</Text>
        </Box>
      )}

      {/* Stats panel */}
      {showStats && (
        <Box borderStyle="single" borderColor="green" padding={1} marginTop={1} flexDirection="column">
          <Text bold color="green">Navigation Statistics</Text>
          <Text> </Text>
          <Box flexDirection="column">
            <Text>Sections:    {stats.sections}</Text>
            <Text>Categories:  {stats.totalCategories}</Text>
            <Text>Documents:   {stats.totalDocuments}</Text>
            <Text>Max Depth:   {stats.maxDepth} levels</Text>
            <Text> </Text>
            <Text>Expanded:    {expandedItems.size} items</Text>
            <Text>Current:     {selectedIndex + 1} of {items.length}</Text>
          </Box>
          <Text> </Text>
          <Text color="gray">Press i to close stats</Text>
        </Box>
      )}

      {/* Footer */}
      <Box 
        marginTop={1} 
        borderStyle="single" 
        borderColor="gray" 
        paddingX={1}
      >
        <Text color="gray">
          ↑↓ Nav • Space: Expand • h: Help • i: Stats • q: Quit
        </Text>
      </Box>

      {/* Breadcrumb */}
      {selectedItem && selectedItem.depth > 0 && !showHelp && !showStats && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Path: {selectedItem.path.join(' › ')}
          </Text>
        </Box>
      )}
    </Box>
  );
};
