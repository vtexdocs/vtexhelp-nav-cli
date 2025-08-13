import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import { Spinner } from '@inkjs/ui';
import { NavigationTree } from './NavigationTree.js';
import { loadNavigation } from './services/navigationService.js';
import { Navigation } from './types/navigation.js';

type Props = {
	filePath?: string;
	language?: string;
};

export default function App({ filePath, language = 'en' }: Props) {
	const [navigation, setNavigation] = useState<Navigation | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const loadData = async () => {
			try {
				const data = await loadNavigation(filePath);
				setNavigation(data);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load navigation');
			} finally {
				setLoading(false);
			}
		};

		loadData();
	}, [filePath]);

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan">Loading navigation data...</Text>
				<Box marginTop={1}>
					<Spinner type="dots" />
				</Box>
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="red">Error: {error}</Text>
				<Text color="gray">Try running: vtexhelp-nav download</Text>
			</Box>
		);
	}

	if (!navigation) {
		return (
			<Box padding={1}>
				<Text color="yellow">No navigation data found</Text>
			</Box>
		);
	}

	return <NavigationTree navigation={navigation} initialLanguage={language} />;
}
