
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory data storage (replace with database in production)
let users = [
  {
    id: 1,
    username: 'admin',
    password: bcrypt.hashSync('admin123', 10),
    role: 'admin'
  },
  {
    id: 2,
    username: 'customer',
    password: bcrypt.hashSync('customer123', 10),
    role: 'customer'
  }
];

let products = [
  { id: 1, name: 'Laptop', price: 999.99, category: 'Electronics', stock: 10 },
  { id: 2, name: 'Phone', price: 599.99, category: 'Electronics', stock: 15 },
  { id: 3, name: 'Book', price: 19.99, category: 'Books', stock: 50 },
  { id: 4, name: 'Headphones', price: 149.99, category: 'Electronics', stock: 20 },
  { id: 5, name: 'T-Shirt', price: 29.99, category: 'Clothing', stock: 30 }
];

let carts = {}; // userId: { items: [{ productId, quantity }] }
let orders = [];
let nextUserId = 3;
let nextProductId = 6;
let nextOrderId = 1;

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Routes

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Auth routes
app.post('/api/register', async (req, res) => {
  const { username, password, role = 'customer' } = req.body;
  
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const newUser = {
    id: nextUserId++,
    username,
    password: hashedPassword,
    role
  };
  
  users.push(newUser);
  res.status(201).json({ message: 'User created successfully', userId: newUser.id });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);
  
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

// Product routes
app.get('/api/products', (req, res) => {
  const { page = 1, limit = 10, search, category } = req.query;
  let filteredProducts = [...products];

  // Search functionality
  if (search) {
    filteredProducts = filteredProducts.filter(p => 
      p.name.toLowerCase().includes(search.toLowerCase())
    );
  }

  // Category filter
  if (category) {
    filteredProducts = filteredProducts.filter(p => 
      p.category.toLowerCase() === category.toLowerCase()
    );
  }

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + parseInt(limit);
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  res.json({
    products: paginatedProducts,
    totalProducts: filteredProducts.length,
    currentPage: parseInt(page),
    totalPages: Math.ceil(filteredProducts.length / limit)
  });
});

app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(product);
});

// Admin product management
app.post('/api/products', authenticateToken, requireAdmin, (req, res) => {
  const { name, price, category, stock } = req.body;
  const newProduct = {
    id: nextProductId++,
    name,
    price: parseFloat(price),
    category,
    stock: parseInt(stock)
  };
  products.push(newProduct);
  res.status(201).json(newProduct);
});

app.put('/api/products/:id', authenticateToken, requireAdmin, (req, res) => {
  const productIndex = products.findIndex(p => p.id === parseInt(req.params.id));
  if (productIndex === -1) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const { name, price, category, stock } = req.body;
  products[productIndex] = {
    ...products[productIndex],
    name: name || products[productIndex].name,
    price: price !== undefined ? parseFloat(price) : products[productIndex].price,
    category: category || products[productIndex].category,
    stock: stock !== undefined ? parseInt(stock) : products[productIndex].stock
  };

  res.json(products[productIndex]);
});

app.delete('/api/products/:id', authenticateToken, requireAdmin, (req, res) => {
  const productIndex = products.findIndex(p => p.id === parseInt(req.params.id));
  if (productIndex === -1) {
    return res.status(404).json({ error: 'Product not found' });
  }

  products.splice(productIndex, 1);
  res.json({ message: 'Product deleted successfully' });
});

// Cart routes
app.get('/api/cart', authenticateToken, (req, res) => {
  const userCart = carts[req.user.userId] || { items: [] };
  const cartWithProducts = {
    items: userCart.items.map(item => {
      const product = products.find(p => p.id === item.productId);
      return {
        ...item,
        product,
        total: product ? product.price * item.quantity : 0
      };
    })
  };
  
  const totalAmount = cartWithProducts.items.reduce((sum, item) => sum + item.total, 0);
  res.json({ ...cartWithProducts, totalAmount });
});

app.post('/api/cart/add', authenticateToken, (req, res) => {
  const { productId, quantity = 1 } = req.body;
  const product = products.find(p => p.id === parseInt(productId));
  
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  if (!carts[req.user.userId]) {
    carts[req.user.userId] = { items: [] };
  }

  const existingItem = carts[req.user.userId].items.find(item => item.productId === parseInt(productId));
  
  if (existingItem) {
    existingItem.quantity += parseInt(quantity);
  } else {
    carts[req.user.userId].items.push({
      productId: parseInt(productId),
      quantity: parseInt(quantity)
    });
  }

  res.json({ message: 'Item added to cart' });
});

app.put('/api/cart/update', authenticateToken, (req, res) => {
  const { productId, quantity } = req.body;
  
  if (!carts[req.user.userId]) {
    return res.status(404).json({ error: 'Cart not found' });
  }

  const itemIndex = carts[req.user.userId].items.findIndex(item => item.productId === parseInt(productId));
  
  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Item not found in cart' });
  }

  if (quantity <= 0) {
    carts[req.user.userId].items.splice(itemIndex, 1);
  } else {
    carts[req.user.userId].items[itemIndex].quantity = parseInt(quantity);
  }

  res.json({ message: 'Cart updated' });
});

app.delete('/api/cart/remove/:productId', authenticateToken, (req, res) => {
  if (!carts[req.user.userId]) {
    return res.status(404).json({ error: 'Cart not found' });
  }

  const itemIndex = carts[req.user.userId].items.findIndex(item => item.productId === parseInt(req.params.productId));
  
  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Item not found in cart' });
  }

  carts[req.user.userId].items.splice(itemIndex, 1);
  res.json({ message: 'Item removed from cart' });
});

// Order routes
app.post('/api/orders', authenticateToken, (req, res) => {
  const userCart = carts[req.user.userId];
  
  if (!userCart || userCart.items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const orderItems = userCart.items.map(item => {
    const product = products.find(p => p.id === item.productId);
    return {
      productId: item.productId,
      productName: product.name,
      price: product.price,
      quantity: item.quantity,
      total: product.price * item.quantity
    };
  });

  const totalAmount = orderItems.reduce((sum, item) => sum + item.total, 0);

  const newOrder = {
    id: nextOrderId++,
    userId: req.user.userId,
    items: orderItems,
    totalAmount,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  orders.push(newOrder);
  
  // Clear cart after order
  carts[req.user.userId] = { items: [] };

  res.status(201).json(newOrder);
});

app.get('/api/orders', authenticateToken, (req, res) => {
  const userOrders = orders.filter(order => order.userId === req.user.userId);
  res.json(userOrders);
});

app.get('/api/admin/orders', authenticateToken, requireAdmin, (req, res) => {
  res.json(orders);
});

// Categories endpoint
app.get('/api/categories', (req, res) => {
  const categories = [...new Set(products.map(p => p.category))];
  res.json(categories);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log('Default users:');
  console.log('Admin: username="admin", password="admin123"');
  console.log('Customer: username="customer", password="customer123"');
});
