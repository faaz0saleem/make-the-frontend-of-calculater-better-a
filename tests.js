let assert = require('assert');

describe('Calculator', () => {
    let display;
    let clear;
    let backspace;
    let divide;
    let multiply;
    let subtract;
    let add;
    let equals;
    let numbers;

    beforeEach(() => {
        display = document.createElement('input');
        display.id = 'display';
        clear = document.createElement('button');
        clear.id = 'clear';
        backspace = document.createElement('button');
        backspace.id = 'backspace';
        divide = document.createElement('button');
        divide.id = 'divide';
        multiply = document.createElement('button');
        multiply.id = 'multiply';
        subtract = document.createElement('button');
        subtract.id = 'subtract';
        add = document.createElement('button');
        add.id = 'add';
        equals = document.createElement('button');
        equals.id = 'equals';
        numbers = [
            document.createElement('button'),
            document.createElement('button'),
            document.createElement('button'),
            document.createElement('button'),
            document.createElement('button'),
            document.createElement('button'),
            document.createElement('button'),
            document.createElement('button'),
            document.createElement('button'),
            document.createElement('button')
        ];
        numbers.forEach((button, index) => {
            button.textContent = index;
        });
    });

    it('should display numbers', () => {
        numbers[0].click();
        assert.strictEqual(display.value, '0');
    });

    it('should clear display', () => {
        numbers[0].click();
        clear.click();
        assert.strictEqual(display.value, '');
    });

    it('should perform addition', () => {
        numbers[1].click();
        add.click();
        numbers[2].click();
        equals.click();
        assert.strictEqual(display.value, '3');
    });

    it('should perform subtraction', () => {
        numbers[5].click();
        subtract.click();
        numbers[3].click();
        equals.click();
        assert.strictEqual(display.value, '2');
    });

    it('should perform multiplication', () => {
        numbers[4].click();
        multiply.click();
        numbers[5].click();
        equals.click();
        assert.strictEqual(display.value, '20');
    });

    it('should perform division', () => {
        numbers[6].click();
        divide.click();
        numbers[3].click();
        equals.click();
        assert.strictEqual(display.value, '2');
    });
});
