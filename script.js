let display = document.getElementById('display');
let clear = document.getElementById('clear');
let backspace = document.getElementById('backspace');
let divide = document.getElementById('divide');
let multiply = document.getElementById('multiply');
let subtract = document.getElementById('subtract');
let add = document.getElementById('add');
let equals = document.getElementById('equals');
let numbers = document.querySelectorAll('.buttons button:not(#clear):not(#backspace):not(#divide):not(#multiply):not(#subtract):not(#add):not(#equals)');

let currentNumber = '';
let previousNumber = '';
let operation = '';

numbers.forEach(button => {
    button.addEventListener('click', () => {
        currentNumber += button.textContent;
        display.value = currentNumber;
    });
});

clear.addEventListener('click', () => {
    currentNumber = '';
    previousNumber = '';
    operation = '';
    display.value = '';
});

backspace.addEventListener('click', () => {
    currentNumber = currentNumber.slice(0, -1);
    display.value = currentNumber;
});

divide.addEventListener('click', () => {
    previousNumber = currentNumber;
    operation = 'divide';
    currentNumber = '';
    display.value = '';
});

multiply.addEventListener('click', () => {
    previousNumber = currentNumber;
    operation = 'multiply';
    currentNumber = '';
    display.value = '';
});

subtract.addEventListener('click', () => {
    previousNumber = currentNumber;
    operation = 'subtract';
    currentNumber = '';
    display.value = '';
});

add.addEventListener('click', () => {
    previousNumber = currentNumber;
    operation = 'add';
    currentNumber = '';
    display.value = '';
});

equals.addEventListener('click', () => {
    let result;
    switch (operation) {
        case 'divide':
            result = parseFloat(previousNumber) / parseFloat(currentNumber);
            break;
        case 'multiply':
            result = parseFloat(previousNumber) * parseFloat(currentNumber);
            break;
        case 'subtract':
            result = parseFloat(previousNumber) - parseFloat(currentNumber);
            break;
        case 'add':
            result = parseFloat(previousNumber) + parseFloat(currentNumber);
            break;
        default:
            result = currentNumber;
    }
    display.value = result;
});
