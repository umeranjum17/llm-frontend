import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../empty-state';
import { Search, FileText, Inbox } from 'lucide-react';

describe('EmptyState', () => {
  describe('basic rendering', () => {
    it('renders title and description', () => {
      render(
        <EmptyState
          title="No results found"
          description="Try adjusting your search criteria"
        />
      );

      expect(screen.getByText('No results found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your search criteria')).toBeInTheDocument();
    });

    it('renders with icon', () => {
      render(
        <EmptyState
          icon={Search}
          title="Search"
          description="Enter a search query"
        />
      );

      // The icon should be rendered (as an SVG)
      expect(document.querySelector('svg')).toBeInTheDocument();
    });

    it('renders without icon', () => {
      render(
        <EmptyState
          title="No icon"
          description="This has no icon"
        />
      );

      expect(screen.getByText('No icon')).toBeInTheDocument();
      // Should not have the icon wrapper
      expect(document.querySelector('.rounded-full.bg-muted')).not.toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('renders primary action button', () => {
      const handleClick = vi.fn();
      render(
        <EmptyState
          title="No items"
          description="Create your first item"
          action={{
            label: 'Create Item',
            onClick: handleClick,
          }}
        />
      );

      const button = screen.getByRole('button', { name: 'Create Item' });
      expect(button).toBeInTheDocument();

      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('renders secondary action button', () => {
      const primaryClick = vi.fn();
      const secondaryClick = vi.fn();

      render(
        <EmptyState
          title="No items"
          description="Create or import items"
          action={{
            label: 'Create',
            onClick: primaryClick,
          }}
          secondaryAction={{
            label: 'Import',
            onClick: secondaryClick,
          }}
        />
      );

      const primaryButton = screen.getByRole('button', { name: 'Create' });
      const secondaryButton = screen.getByRole('button', { name: 'Import' });

      expect(primaryButton).toBeInTheDocument();
      expect(secondaryButton).toBeInTheDocument();

      fireEvent.click(secondaryButton);
      expect(secondaryClick).toHaveBeenCalledTimes(1);
      expect(primaryClick).not.toHaveBeenCalled();
    });

    it('renders only secondary action when primary is not provided', () => {
      const handleClick = vi.fn();
      render(
        <EmptyState
          title="No items"
          description="Import items"
          secondaryAction={{
            label: 'Import',
            onClick: handleClick,
          }}
        />
      );

      expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    });

    it('does not render action buttons when not provided', () => {
      render(
        <EmptyState
          title="No actions"
          description="This has no action buttons"
        />
      );

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('children', () => {
    it('renders custom children', () => {
      render(
        <EmptyState
          title="With children"
          description="Custom content below"
        >
          <div data-testid="custom-content">Custom child content</div>
        </EmptyState>
      );

      expect(screen.getByTestId('custom-content')).toBeInTheDocument();
      expect(screen.getByText('Custom child content')).toBeInTheDocument();
    });

    it('renders children before action buttons', () => {
      render(
        <EmptyState
          title="With both"
          description="Children and actions"
          action={{ label: 'Action', onClick: () => {} }}
        >
          <p>Child paragraph</p>
        </EmptyState>
      );

      const container = screen.getByText('With both').parentElement;
      expect(container).toContainElement(screen.getByText('Child paragraph'));
      expect(container).toContainElement(screen.getByRole('button'));
    });
  });

  describe('styling', () => {
    it('applies custom className', () => {
      render(
        <EmptyState
          title="Styled"
          description="With custom class"
          className="custom-empty-state"
        />
      );

      const container = screen.getByText('Styled').closest('.custom-empty-state');
      expect(container).toBeInTheDocument();
    });

    it('has centered text alignment', () => {
      render(
        <EmptyState
          title="Centered"
          description="Should be centered"
        />
      );

      const container = screen.getByText('Centered').closest('.text-center');
      expect(container).toBeInTheDocument();
    });

    it('applies padding and spacing', () => {
      render(
        <EmptyState
          title="Spaced"
          description="With padding"
        />
      );

      const container = screen.getByText('Spaced').closest('.py-12');
      expect(container).toBeInTheDocument();
    });
  });

  describe('different use cases', () => {
    it('works for empty search results', () => {
      render(
        <EmptyState
          icon={Search}
          title="No results found"
          description="Try searching for something else"
          action={{
            label: 'Clear search',
            onClick: vi.fn(),
          }}
        />
      );

      expect(screen.getByText('No results found')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
    });

    it('works for empty inbox', () => {
      render(
        <EmptyState
          icon={Inbox}
          title="Your inbox is empty"
          description="New messages will appear here"
        />
      );

      expect(screen.getByText('Your inbox is empty')).toBeInTheDocument();
    });

    it('works for empty document list', () => {
      const handleCreate = vi.fn();
      const handleImport = vi.fn();

      render(
        <EmptyState
          icon={FileText}
          title="No documents"
          description="Create a new document or import existing ones"
          action={{
            label: 'Create document',
            onClick: handleCreate,
          }}
          secondaryAction={{
            label: 'Import',
            onClick: handleImport,
          }}
        />
      );

      expect(screen.getByText('No documents')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create document' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('title is an h3 heading', () => {
      render(
        <EmptyState
          title="Heading"
          description="Description"
        />
      );

      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading).toHaveTextContent('Heading');
    });

    it('description is a paragraph', () => {
      render(
        <EmptyState
          title="Title"
          description="This is the description"
        />
      );

      const description = screen.getByText('This is the description');
      expect(description.tagName).toBe('P');
    });

    it('buttons are keyboard accessible', () => {
      const handleClick = vi.fn();
      render(
        <EmptyState
          title="Test"
          description="Test"
          action={{
            label: 'Click me',
            onClick: handleClick,
          }}
        />
      );

      const button = screen.getByRole('button');
      button.focus();
      expect(document.activeElement).toBe(button);

      // Simulate Enter key press
      fireEvent.keyDown(button, { key: 'Enter' });
    });
  });
});
