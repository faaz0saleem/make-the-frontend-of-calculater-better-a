const calculateButton = document.getElementById('calculate');
const num1Input = document.getElementById('num1');
const operationSelect = document.getElementById('operation');
const num2Input = document.getElementById('num2');
const resultParagraph = document.getElementById('result');

calculateButton.addEventListener('click', () => {
  const num1 = num1Input.value;
  const operation = operationSelect.value;
  const num2 = num2Input.value;

  fetch(`http://localhost:3000/calculate?num1=${num1}&num2=${num2}&operation=${operation}`)
    .then(response => response.json())
    .then(data => {
      resultParagraph.textContent = `Result: ${data.result}`;
    })
    .catch(error => console.error(error));
});
