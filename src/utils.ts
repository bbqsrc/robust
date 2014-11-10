function generateElementWrapper(classObject) {
    var wrapper: any = new Function(classObject.ELEMENT_CLASS);
    wrapper.prototype = Object.create(HTMLElement.prototype);
    wrapper.ELEMENT_CLASS = classObject.ELEMENT_CLASS;

    var cur = classObject.prototype;
    var parent = [cur];

    while ((cur = Object.getPrototypeOf(cur)) != Object.prototype) {
        parent.unshift(cur);
    }

    Log.d("generateElementWrapper", "mixins:", parent);

    parent.forEach(proto => {
        Object.getOwnPropertyNames(proto).forEach(name => {
            wrapper.prototype[name] = proto[name];
        })
    });

    (<Document>document).registerElement(classObject.ELEMENT_TAG, {
        prototype: wrapper.prototype
    });
}

function convertUTCToLocal(instantUTC: number) {
    // Minutes * 60 (seconds) * 1000 (ms)
    var offset = -new Date().getTimezoneOffset() * 60 * 1000;
    return instantUTC + offset;
}
