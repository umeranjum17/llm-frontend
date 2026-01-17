import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SummaryStep } from '../steps/summary-step';

describe('SummaryStep', () => {
  const defaultProps = {
    onComplete: vi.fn(),
    configuredFeatures: {
      provider: 'OpenRouter',
      memory: true,
      mcp: true,
    },
  };

  it('renders all tabs', () => {
    render(<SummaryStep {...defaultProps} />);

    // Get tab buttons by their role
    const tabButtons = screen.getAllByRole('button');
    const tabTexts = tabButtons.map(btn => btn.textContent);

    expect(tabTexts.some(t => t?.includes('Overview'))).toBe(true);
    expect(tabTexts.some(t => t?.includes('Shortcuts'))).toBe(true);
    expect(tabTexts.some(t => t?.includes('Skills'))).toBe(true);
    expect(tabTexts.some(t => t?.includes('Agents'))).toBe(true);
  });

  it('displays Skills tab content when clicked', async () => {
    render(<SummaryStep {...defaultProps} />);

    // Find and click on Skills tab button
    const skillsTabButton = screen.getAllByRole('button').find(btn =>
      btn.textContent?.includes('Skills') && !btn.textContent?.includes('Start')
    );
    expect(skillsTabButton).toBeDefined();
    fireEvent.click(skillsTabButton!);

    // Wait for animation and check that skills content is visible
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    expect(screen.getByText('Create Chart')).toBeInTheDocument();
    expect(screen.getByText('Create Diagram')).toBeInTheDocument();
    expect(screen.getByText('Code Review')).toBeInTheDocument();
    expect(screen.getByText('Debug')).toBeInTheDocument();
    expect(screen.getByText('Pros & Cons')).toBeInTheDocument();
    expect(screen.getByText('Generate Image')).toBeInTheDocument();
    expect(screen.getByText('Create React App')).toBeInTheDocument();
  });

  it('displays all 8 skills', async () => {
    render(<SummaryStep {...defaultProps} />);

    // Click on Skills tab
    const skillsTabButton = screen.getAllByRole('button').find(btn =>
      btn.textContent?.includes('Skills') && !btn.textContent?.includes('Start')
    );
    fireEvent.click(skillsTabButton!);

    // Verify 8 skills are shown
    const skillNames = [
      'Summarize',
      'Create Chart',
      'Create Diagram',
      'Code Review',
      'Debug',
      'Pros & Cons',
      'Generate Image',
      'Create React App',
    ];

    await waitFor(() => {
      for (const skillName of skillNames) {
        expect(screen.getByText(skillName)).toBeInTheDocument();
      }
    });
  });

  it('shows Skills status description in Overview tab', () => {
    render(<SummaryStep {...defaultProps} />);

    // Check for Skills status description in overview
    expect(screen.getByText('8 built-in skills ready to use')).toBeInTheDocument();
    expect(screen.getByText('Built-in')).toBeInTheDocument();
  });

  it('calls onComplete when Start Chatting button is clicked', () => {
    const onComplete = vi.fn();
    render(<SummaryStep {...defaultProps} onComplete={onComplete} />);

    fireEvent.click(screen.getByText('Start Chatting'));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
