export interface Product {
  id: string;
  name: string;
  price: string;
  images: string[];
  /** Отдельная обложка для каталога (например, PNG без фона). По умолчанию images[0]. */
  cover?: string;
  description: string;
  soldOut: boolean;
  archived: boolean;
}
