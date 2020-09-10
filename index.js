import { fromEvent, EMPTY, BehaviorSubject } from "rxjs";
import { filter, switchMap, timeoutWith, tap, share } from "rxjs/operators";

class InputCurrency extends HTMLElement {
  constructor() {
    super();
    // ! Template zone
    this.innerHTML = '<input type="number"/>';
    const input = this.querySelector("input");
    // const template = document.querySelector("#templateID"); // for external template
    // const template = document.createElement("template");    // for javascript string dynamic template
    // template.innerHTML = templateString;                    // for javascript string dynamic template
    // ! Shadow zone
    // this.attachShadow({ mode: "open" });
    // this.shadowRoot.appendChild(template.content.cloneNode(true));
    //  ! Implementation zone
    // * Determine if we are in PureGeko (Firefox) or like Geko (Chrome,Safari,Edge,Opera)
    this.isGecko = this.isBrowserGecko();
    // * $treams definition
    // ! Seems like fromEvent does not share by default
    this.focus$ = fromEvent(input, "focus").pipe(share());
    this.click$ = fromEvent(input, "click").pipe(share());
    this.keyUp$ = fromEvent(input, "keyup").pipe(share());
    this.blur$ = fromEvent(input, "blur").pipe(share());
    //input.addEventListener("focus", (e) => this.focus$.next(e), false);
    //input.addEventListener("click", (e) => this.click$.next(e), false);
    //input.addEventListener("keyup", (e) => this.keyUp$.next(e), false);
    //input.addEventListener("blur", (e) => this.blur$.next(e), false);
    // * Landing position by Click (Focus + click)
    this.landingClick$ = this.focus$.pipe(
      switchMap((e) => {
        // cancel previous active subscription and subscribe to the returned observable
        return this.click$.pipe(timeoutWith(100, EMPTY)); // will complete if timeOut.
      })
    );
    // * Landing position by Tabulation (Focus + KeyUp key Tab)
    this.landingTab$ = this.focus$.pipe(
      switchMap((e) => {
        // cancel previous active subscription and subscribe to the returned observable
        /*return this.click$.pipe(
          timeoutWith(100, of({ focusedByClick: false, event: e })),
          filter((obj) => obj.focusedByClick === false)
        );*/
        return this.keyUp$.pipe(
          // This implementation is error Prone needs higher timeouts but beter handle Browser Tabulation out and in, or Tab long pressed arround
          filter((e) => e.key === "Tab"), // Only fire when the focus is landed by KeyUp Tab
          timeoutWith(250, EMPTY) // will complete if timeOut.
        );
      })
    );
    // * Current Carret
    this.carretPos = new BehaviorSubject(0);
    this.decimalPos = new BehaviorSubject(1);
    this.formatedValue = new BehaviorSubject("0.00");
    /*tap(
              (a) => console.log("a", a),
              (b) => console.log("b", b),
              () => console.log("c")
            )*/
  }
  /* Custom Element main callbacks
    connectedCallback() { ... }
    attributeChangeCallback() { ... }
    disconnectedCallback() { ... } //https://lit-element.polymer-project.org/guide/events If your component adds an event listener to anything except itself or its children
    */
  // Public functions can be called by outside world
  // And also outside world can listen to customEvents
  // const customEvent = new CustomEvent(eventName, {detail: payload});
  // this.dispatchEvent(customEvent);
  // Functional
  isBrowserGecko() {
    // ! This is why selection.modify does not work on Mozilla Input Number
    // * Mozilla does not fulfill window.selection on focus Input type Number
    // * Returning this if nothing else is selected Mozila: {type:"None", rangeCount="0"} selection.toString() = ""
    // * Or Returning another carret if user has the carret previusly on other stuff

    //* Chrome Safari Edge are now WebKit like Gecko
    if (navigator.userAgent.toLowerCase().indexOf("like gecko") > -1) {
      return false;
    }
    //* Firefox includes Gecko/geckotrail
    if (navigator.userAgent.toLowerCase().indexOf("gecko/")) {
      return true;
    }
  }
}
window.customElements.define("input-currency", InputCurrency);
