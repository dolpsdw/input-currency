import { fromEvent, EMPTY, BehaviorSubject, merge, partition } from "rxjs";
import {
  filter,
  switchMap,
  timeoutWith,
  tap,
  share,
  skip,
  delay,
  throttleTime,
  debounceTime,
  withLatestFrom,
} from "rxjs/operators";

class InputCurrency extends HTMLElement {
  constructor() {
    super();
    // ! Template zone
    this.innerHTML = '<input type="number"/>';
    this.input = this.querySelector("input");
    // const template = document.querySelector("#templateID"); // for external template
    // const template = document.createElement("template");    // for javascript string dynamic template
    // template.innerHTML = templateString;                    // for javascript string dynamic template
    // ! Shadow zone
    // this.attachShadow({ mode: "open" });
    // this.shadowRoot.appendChild(template.content.cloneNode(true));
    //  ! Implementation zone
  }
  // ! Use connectedCallback to Alocate resources
  connectedCallback() {
    this.input.value = "0.00";
    // * Determine if we are in PureGeko (Firefox) or like Geko (Chrome,Safari,Edge,Opera)
    this.isGecko = this.isBrowserGecko();
    // * $treams definition
    // ! Seems like fromEvent does not share by default
    this.focus$ = fromEvent(this.input, "focus").pipe(share());
    this.click$ = merge(
      fromEvent(this.input, "click").pipe(share()),
      fromEvent(this.input, "auxclick").pipe(share())
    );
    this.keyUp$ = fromEvent(this.input, "keyup").pipe(share());
    this.blur$ = fromEvent(this.input, "blur").pipe(share());
    this.select$ = fromEvent(this.input, "select").pipe(share());
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
    // * State streams
    this.carretPos$ = new BehaviorSubject(0);
    this.decimalPos$ = new BehaviorSubject(1); // Usefull for user pressing , or . to realocate and maybe for this.landingTab$ default carretPos
    this.formatedValue$ = new BehaviorSubject("0.00");
    // * Sync internar state with real input
    this.carretPos$.pipe(skip(1)).subscribe((pos) => this.setCarret(pos));
    this.decimalPos$
      .pipe(skip(1))
      .subscribe((dPos) => this.formatedValue$.next("0.00"));
    this.formatedValue$.pipe(skip(1)).subscribe((val) => {
      this.input.value = val;
      this.setCarret(this.carretPos$.getValue());
    });
    this.isSkipOneSelect = false; //  = new BehaviorSubject(false);
    // * Logic
    // ! Every setCarret in Pos will trigger a selection Event
    // ! ChromeSafari getCarret will trigger selection Event only if text before carret
    // ? ChromeSafari focusClick on 0.|00
    // * -...-pointermousedown-focus-pointermouseup-click-
    // ChromeSafari focusClick on |0.00
    // -...-pointermousedown...-focus-pointermouseup-click-
    // ChromeSafari Click on 0.|00
    // -...-pointermousedown-pointermouseup-click-
    // ChromeSafari Click on |0.00
    // -...-pointermousedown-pointermouseup-click-
    // Firefox focusClick on 0.|00
    // -...-pointermousedown...-focus-pointermouseup-click-
    // Firefox focusClick on |0.00
    // -...-pointermousedown...-focus-pointermouseup-click-
    // Firefox Click on 0.|00
    // -...-pointermousedown-pointermouseup-click-
    // Firefox Click on |0.00
    // -...-pointermousedown-pointermouseup-click-
    // ChromeSafari selectClick Ending on Extremes and Ending on midle
    // -...-pointermousedown-?focus-PointerMouseMove-PointerMouseUp-click-select
    // ! A semaphore to take select events is needed, because multiple hacks are fireng it and because
    // ! Or forcing select event to be grouped by windowWhen
    // ! Or forcing select(withLatestFrom carretPos & formatedValue) to inmidiatly inpt.vl="" and inpt.vl=latestFormat and debounce and trottle and call setCarret
    // Firefox selectClick Ending on Extremes and Ending on midle
    // -...-pointermousedown-?focus-PointerMouseMove-PointerMouseUp-select-click
    // ChromeSafari focusTab should |0.00
    // --focus-select-keyupTab
    // Firefox focusTab should |0.00
    // --focus-select-keyupTab
    // ChromeSafari focusFromAltTabIn should |0.00
    // (blur-pointerOut-pointerLeave-mouseOut-mouseleave)--focus
    // Firefox focusFromAltTabIn should |0.00
    // (blur-pointerOut-pointerLeave-mouseOut-mouseleave)--focus
    // ChromeSafari keyUp evaluate insertion
    // --keyDown-keypress-textInput-input-keyUp
    // Firefox keyUp evaluate insertion
    // --keyDown-keypress-input-keyUp
    // ChromeSafari keyUp insert & calculateCarret & setCarret
    // Firefox keyUp insert & calculateCarret & setCarret
    // hot ('^--clickE ! 50ms (#|)') ...
    // ! Maybe use pointerDown to getCarretPos ? and avoid user be able to hold down click and select ?
    this.click$.subscribe((e) => {
      // ! We need to get the click clientX clientY for mozilla carret position and then calculate on keyup next position
      // ! onChrome this click if is done at a point where selection.modify select something will fire a select Event thath will execute select cycle atLeast once
      const pos = this.getCarretPosAtClick(this.isGecko, e);
      if (pos !== null) {
        // pos can be null when selection is not a single carret
        // ! carretPos will execute a sync operation calling select cycle another time
        this.carretPos$.next(pos);
      }
    });
    this.blur$.subscribe((e) => {
      this.carretPos$.next(0); // reset carretPost to 0 for Focus with no click (tab, alt tab)
      this.isSkipOneSelect = false; // reset skipOneSelect to false for Focus with no click (tab, alt tab)
    });
    // ! The "easiest" way to address the hacks calling select
    /*this.select$
      .pipe(
        debounceTime(9), // Give time to the hacks to stop firing selects and have a final carretPos$ value
        throttleTime(18) // Forget about the next selection events that will be fired by setCarret.
      )
      .subscribe((e) => {
        console.log("SELECT!");
        this.input.value = ""; // selection hack to be unselectable with no delay
        this.input.value = this.formatedValue$.getValue();
        this.setCarret(this.carretPos$.getValue());
      });*/
    // ! Lets try a more elegant solution
    //this.isSkipOneSelect$.subscribe((ok) => console.log(`isSKip ${ok}`));
    var [skipOneSelect, exeSelect] = partition(
      this.select$.pipe(debounceTime(1)), // This solve firefox crash
      (e, index) => this.isSkipOneSelect === true,
      this
    );
    this.skipOneSelect$ = skipOneSelect;
    this.onSelect$ = exeSelect;
    this.skipOneSelect$.pipe(delay(1)).subscribe((ok) => {
      // needs 1ms delay to be efective
      this.isSkipOneSelect = false;
    });
    this.onSelect$.subscribe((e) => {
      console.log("SELECT!");
      this.input.value = "";
      this.input.value = this.formatedValue$.getValue();
      this.setCarret(this.carretPos$.getValue());
    });
    // * KeyUp validation is valid number and carretPos decimalPos formatedValue update
    this.carretPos$.subscribe(
      (ok) => console.log("ok", ok),
      (nok) => console.log("nok", nok)
    );
    //test e.preventdefault and e.stopPropagation ?
    // * KeyDown preventDefault
    // ? formatedValue reWrite input always, if invalid stuff is typed is overwritten.
    // ? Selection preventDefault stopProp when selection is diferent than carret check if that works with the setSelectionRange
    /*tap(
                  (a) => console.log("a", a),
                  (b) => console.log("b", b),
                  () => console.log("c")
                )*/
  }
  // ! Use disconnectedCallback to Free resources
  disconnectedCallback() {
    // FromEvent
    this.focus$.complete();
    this.click$.complete();
    this.keyUp$.complete();
    this.blur$.complete();
    this.select$.complete();
    this.landingClick$.complete();
    this.landingTab$.complete();
    // State
    this.carretPos.complete();
    this.decimalPos.complete();
    this.formatedValue.complete();
    // Logic
    this.skipOneSelect$.complete();
    this.onSelect$.complete();
  }
  /* Custom Element main callbacks
    constructor() -> When the JS Object is created
    connectedCallback() { ... } -> When the custom Element is appended to the DOM
    attributeChangeCallback() { ... } -> When the custom Element is called by setAtribute
    disconnectedCallback() { ... } -> When the custom Element is deTached from the DOM //https://lit-element.polymer-project.org/guide/events If your component adds an event listener to anything except itself or its children
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
  getCarretPosAtClick(isGecko, e) {
    if (isGecko === true && document.caretPositionFromPoint) {
      return document.caretPositionFromPoint(e.clientX, e.clientY).offset; // Mozilla Firefox getSelectionHack
    }
    var selection = window.getSelection(); // Chrome,Safari getSelectionHack
    if (
      isGecko === false &&
      selection &&
      selection.type === "Caret" &&
      selection.rangeCount === 1
    ) {
      var carretPos;
      selection.modify("extend", "backward", "line"); // May Trigger Select event but will be shared with setCarret if called enought fast
      var carretSelection = selection.toString(); // This will have 01 string at start from  01,00
      //?ToTest In case |,00 the carretSelection will be "" or in case of 1|23,45 delete 1 //? what happen when ,|00 and delete ,?
      if (
        carretSelection === null ||
        carretSelection === undefined ||
        carretSelection === ""
      ) {
        carretPos = 0;
      } else {
        // ! Trigger Select Event
        this.isSkipOneSelect = true;
        carretPos = carretSelection.length;
      }
      return carretPos;
    }
    return null;
  }
  setCarret(pos) {
    // Todo: Test on Chrome,Safari, and Mozilla specialy the setSelectionRange
    console.log("setCarret! May fire a select event");
    this.input.setAttribute("type", "tel"); //* This will still change keyboard on chrome if not changed to number quickly
    this.isSkipOneSelect = true;
    setTimeout(() => {
      this.input.setSelectionRange(pos, pos); // ! This will fire Select SomeTimes but not when it only got focused by tab ?
      this.input.setAttribute("type", "number"); // setSelectionHack
    }, 1); // 1ms delay for focus auto select and setAttribute to settle
  }
}
window.customElements.define("input-currency", InputCurrency);
