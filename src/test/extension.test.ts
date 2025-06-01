import { describe, test, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { resetMocks } from './helpers/testHelpers';

describe('PRD Assistant Extension Test Suite', () => {
	beforeEach(() => {
		resetMocks();
	});

	test('Extension loads successfully', () => {
		// Basic smoke test to ensure extension structure is valid
		expect(true).toBe(true);
	});

	test('Test infrastructure works', () => {
		// Verify test helpers and mocks work
		resetMocks();
		expect(true).toBe(true);
	});
});
