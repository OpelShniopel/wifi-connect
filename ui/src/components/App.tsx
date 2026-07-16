import React from 'react';
import { Navbar, Provider, Container } from 'rendition';
import { NetworkInfoForm } from './NetworkInfoForm';
import { Notifications } from './Notifications';
import { createGlobalStyle } from 'styled-components';

const GlobalStyle = createGlobalStyle`
	body {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
			'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
			sans-serif;
		background: var(--main);
		color: var(--txt);
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
	}

	code {
		font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace;
	}

	form label {
		font-weight: 700;
	}

	#root_ssid {
		border: solid var(--lighter) !important;
	}

	form input {
		border: solid var(--lighter) !important;
	}

	#root_ssid__input {
		border: none !important;
	}

	form input:focus,
	form select:focus,
	form textarea:focus {
		box-shadow: none !important;
	}

	#root_ssid__input {
		color: var(--txt) !important;
	}

	.StyledIcon-sc-ofa7kd-0 path {
		stroke: var(--txt) !important;
	}

	#root_ssid__select-drop {
		background-color:  var(--darker) !important;
		color: white !important;
	}

	#root_ssid__select-drop [role="option"][aria-selected="true"] {
		background-color: var(--darker) !important;
		color: var(--primary) !important;
	}

	#root_ssid__select-drop [role="option"]:hover {
		background-color: var(--primary) !important;
		color: white !important;
	}
`;

export interface NetworkInfo {
	ssid?: string;
	identity?: string;
	passphrase?: string;
}

export interface Network {
	ssid: string;
	security: string;
}

// Rescan drops the AP ~1s after the 202 and brings it back once the scan is
// done; the phone then needs a moment to rejoin. Wait a bit before the first
// poll, retry until the portal is reachable again, give up after 90s.
const REFRESH_POLL_INITIAL_DELAY_MS = 4000;
const REFRESH_POLL_INTERVAL_MS = 3000;
const REFRESH_POLL_ATTEMPT_TIMEOUT_MS = 5000;
const REFRESH_POLL_DEADLINE_MS = 90000;

const App = () => {
	const [attemptedConnect, setAttemptedConnect] = React.useState(false);
	const [isFetchingNetworks, setIsFetchingNetworks] = React.useState(true);
	const [isRefreshingNetworks, setIsRefreshingNetworks] = React.useState(false);
	const [error, setError] = React.useState('');
	const [availableNetworks, setAvailableNetworks] = React.useState<Network[]>(
		[],
	);

	const fetchNetworks = (timeoutMs?: number): Promise<Network[]> => {
		let signal: AbortSignal | undefined;
		let timer: number | undefined;

		if (timeoutMs !== undefined) {
			const controller = new AbortController();
			signal = controller.signal;
			timer = window.setTimeout(() => {
				controller.abort();
			}, timeoutMs);
		}

		return fetch('/networks', { cache: 'no-store', signal })
			.then((data) => {
				if (data.status !== 200) {
					throw new Error(data.statusText);
				}

				return data.json();
			})
			.finally(() => {
				if (timer !== undefined) {
					window.clearTimeout(timer);
				}
			});
	};

	React.useEffect(() => {
		fetchNetworks()
			.then(setAvailableNetworks)
			.catch((e: Error) => {
				setError(`Failed to fetch available networks. ${e.message || e}`);
			})
			.finally(() => {
				setIsFetchingNetworks(false);
			});
	}, []);

	const onConnect = (data: NetworkInfo) => {
		setAttemptedConnect(true);
		setError('');

		fetch('/connect', {
			method: 'POST',
			body: JSON.stringify(data),
			headers: {
				'Content-Type': 'application/json',
			},
		})
			.then((resp) => {
				if (resp.status !== 200) {
					throw new Error(resp.statusText);
				}
			})
			.catch((e: Error) => {
				setError(`Failed to connect to the network. ${e.message || e}`);
			});
	};

	// The rescan tears the access point down, so the portal is unreachable
	// until the phone rejoins it. Poll until a fetch gets through, then show
	// the fresh list — no manual page reload needed.
	const pollNetworksUntilRefreshed = (deadline: number) => {
		fetchNetworks(REFRESH_POLL_ATTEMPT_TIMEOUT_MS)
			.then((networks) => {
				setAvailableNetworks(networks);
				setError('');
				setIsRefreshingNetworks(false);
			})
			.catch(() => {
				if (Date.now() < deadline) {
					window.setTimeout(() => {
						pollNetworksUntilRefreshed(deadline);
					}, REFRESH_POLL_INTERVAL_MS);
				} else {
					setIsRefreshingNetworks(false);
					setError(
						'Could not reach the device after the rescan. Reconnect to the access point and reload this page.',
					);
				}
			});
	};

	const startRefreshPolling = () => {
		const deadline = Date.now() + REFRESH_POLL_DEADLINE_MS;
		window.setTimeout(() => {
			pollNetworksUntilRefreshed(deadline);
		}, REFRESH_POLL_INITIAL_DELAY_MS);
	};

	const onRefreshNetworks = () => {
		setIsRefreshingNetworks(true);
		setError('');

		fetch('/networks/refresh', {
			method: 'POST',
		})
			.then((resp) => {
				if (resp.status !== 202 && resp.status !== 200) {
					throw new Error(resp.statusText);
				}

				startRefreshPolling();
			})
			.catch((e: Error) => {
				if (e instanceof TypeError) {
					// The network dropped before the response arrived — the AP is
					// likely already down and the rescan underway, so poll anyway.
					startRefreshPolling();
				} else {
					setIsRefreshingNetworks(false);
					setError(`Failed to refresh available networks. ${e.message || e}`);
				}
			});
	};

	const customTheme = {
		colors: {
			primary: {
				main: '#FF8D28',
				light: '#FFA352',
				dark: '#E67610',
			},
			secondary: {
				main: '#FFFFFF',
				light: '#FFFFFF',
				dark: '#FFFFFF',
			},
			tertiary: {
				main: '#FF8D28',
				light: '#FF8D28',
				dark: '#FF8D28',
			},
			// quartenary: {
			// 	main: '#FF8D28',
			// 	light: '#FF8D28',
			// 	dark: '#FF8D28',
			// },
			text: {
				main: '#FFFFFF',
				light: '#FFFFFF',
				dark: '#FFFFFF',
			},
			neutral: {
				main: '#FFFFFF',
				light: '#FFFFFF',
				dark: '#FFFFFF',
			},
			aaaaaaaa: {
				main: '#FF8D28',
				light: '#FF8D28',
				dark: '#FF8D28',
			},
		},
	};
	return (
		<Provider theme={customTheme}>
			<GlobalStyle />
			{/* <Navbar brand={<img src={logo} style={{ height: 30 }} alt="logo" />} /> */}
			<Navbar
				brand={
					<div
						style={{ fontWeight: '700', fontSize: '24px', fontFamily: 'K2D' }}
					>
						PlayControl
					</div>
				}
				style={{
					background: 'var(--header)',
				}}
			></Navbar>

			<Container>
				<Notifications
					attemptedConnect={attemptedConnect}
					isRefreshingNetworks={isRefreshingNetworks}
					hasAvailableNetworks={
						isFetchingNetworks || availableNetworks.length > 0
					}
					error={error}
				/>
				<NetworkInfoForm
					availableNetworks={availableNetworks}
					// availableNetworks={[
					// 	{ ssid: 'Home WiFi', security: 'wpa2' },
					// 	{ ssid: 'Office Network', security: 'wpa2' },
					// 	{ ssid: 'Guest', security: 'open' },
					// 	{ ssid: 'Enterprise Net', security: 'enterprise' },
					// ]}
					onSubmit={onConnect}
					onRefreshNetworks={onRefreshNetworks}
					isRefreshingNetworks={isRefreshingNetworks}
				/>
			</Container>
		</Provider>
	);
};

export default App;
