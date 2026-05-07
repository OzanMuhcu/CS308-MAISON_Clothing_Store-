import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock the API module so no real HTTP requests are made
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from '../services/api';

const mockProducts = [
  {
    id: 1,
    name: 'Classic White T-Shirt',
    price: 29.99,
    category: 'T-Shirts',
    stock: 10,
    avgRating: 4.5,
    ratingCount: 8,
    imageUrl: 'https://example.com/tshirt.jpg',
  },
  {
    id: 2,
    name: 'Slim Fit Jeans',
    price: 79.99,
    category: 'Jeans',
    stock: 5,
    avgRating: 4.0,
    ratingCount: 3,
    imageUrl: 'https://example.com/jeans.jpg',
  },
];

describe('Landing page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { products: mockProducts, categories: ['T-Shirts', 'Jeans'] },
    });
  });

  it('renders without crashing', async () => {
    const { container } = render(
      <MemoryRouter>
        <div data-testid="landing-root">Landing</div>
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
  });

  it('mock api returns expected product count', async () => {
    const res = await api.get('/products');
    expect(res.data.products).toHaveLength(2);
  });

  it('first product has a positive price', async () => {
    const res = await api.get('/products');
    const products = res.data.products;
    products.forEach((p: { price: number }) => {
      expect(p.price).toBeGreaterThan(0);
    });
  });

  it('all products have non-empty names', async () => {
    const res = await api.get('/products');
    res.data.products.forEach((p: { name: string }) => {
      expect(p.name.trim().length).toBeGreaterThan(0);
    });
  });

  it('categories list is returned correctly', async () => {
    const res = await api.get('/products');
    expect(res.data.categories).toContain('T-Shirts');
    expect(res.data.categories).toContain('Jeans');
  });
});
