import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProductCard from '../components/ProductCard';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockProduct = {
  id: 1,
  name: 'Classic White T-Shirt',
  price: 29.99,
  category: 'T-Shirts',
  stock: 10,
  avgRating: 4.5,
  ratingCount: 12,
  imageUrl: 'https://example.com/tshirt.jpg',
};

const renderCard = (props = {}) =>
  render(
    <MemoryRouter>
      <ProductCard product={{ ...mockProduct, ...props }} />
    </MemoryRouter>
  );

describe('ProductCard', () => {
  it('renders the product name', () => {
    renderCard();
    expect(screen.getByText('Classic White T-Shirt')).toBeInTheDocument();
  });

  it('renders the product price formatted correctly', () => {
    renderCard();
    expect(screen.getByText(/29\.99/)).toBeInTheDocument();
  });

  it('renders the product category', () => {
    renderCard();
    expect(screen.getByText(/T-Shirts/i)).toBeInTheDocument();
  });

  it('renders the product image with correct alt text', () => {
    renderCard();
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', expect.stringContaining('Classic White T-Shirt'));
  });

  it('shows average rating when ratingCount > 0', () => {
    renderCard();
    expect(screen.getByText(/4\.5/)).toBeInTheDocument();
  });

  it('does not show rating when ratingCount is 0', () => {
    renderCard({ avgRating: 0, ratingCount: 0 });
    expect(screen.queryByText(/4\.5/)).not.toBeInTheDocument();
  });

  it('shows out-of-stock indicator when stock is 0', () => {
    renderCard({ stock: 0 });
    expect(screen.getByText(/out of stock/i)).toBeInTheDocument();
  });

  it('does not show out-of-stock when stock is available', () => {
    renderCard({ stock: 5 });
    expect(screen.queryByText(/out of stock/i)).not.toBeInTheDocument();
  });

  it('navigates to product detail page on click', () => {
    renderCard();
    fireEvent.click(screen.getByText('Classic White T-Shirt'));
    expect(mockNavigate).toHaveBeenCalledWith('/products/1');
  });
});
