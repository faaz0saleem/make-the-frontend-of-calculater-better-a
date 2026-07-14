const express = require('express');
const app = express();
const port = 3000;

app.use(express.static('public'));

app.get('/calculate', (req, res) => {
  const { num1, num2, operation } = req.query;
  let result;

  switch (operation) {
    case 'add':
      result = parseFloat(num1) + parseFloat(num2);
      break;
    case 'subtract':
      result = parseFloat(num1) - parseFloat(num2);
      break;
    case 'multiply':
      result = parseFloat(num1) * parseFloat(num2);
      break;
    case 'divide':
      if (num2 !== '0') {
        result = parseFloat(num1) / parseFloat(num2);
      } else {
        result = 'Error: Division by zero';
      }
      break;
    default:
      result = 'Invalid operation';
  }

  res.json({ result });
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
