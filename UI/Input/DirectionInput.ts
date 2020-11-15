import {InputElement} from "./InputElement";
import {UIEventSource} from "../../Logic/UIEventSource";
import Combine from "../Base/Combine";
import Svg from "../../Svg";

/**
 * Selects a direction in degrees
 */
export default class DirectionInput extends InputElement<string> {

    private readonly value: UIEventSource<string>;
    public readonly IsSelected: UIEventSource<boolean> = new UIEventSource<boolean>(false);

    constructor(value?: UIEventSource<string>) {
        super();
        this.dumbMode = false;
        this.value = value ?? new UIEventSource<string>(undefined);

        this.value.addCallbackAndRun(rotation => {
            const selfElement = document.getElementById(this.id);
            if (selfElement === null) {
                return;
            }
            const cone = selfElement.getElementsByClassName("direction-svg")[0] as HTMLElement
            cone.style.rotate = rotation + "deg";

        })

    }


    GetValue(): UIEventSource<string> {
        return this.value;
    }

    InnerRender(): string {
        console.log("Inner render direction")
        return new Combine([
            Svg.direction_svg().SetStyle(
                `position: absolute;top: 0;left: 0;width: 100%;height: 100%;rotate:${this.value.data}deg;`)
                .SetClass("direction-svg"),
            Svg.compass_svg().SetStyle(
                "position: absolute;top: 0;left: 0;width: 100%;height: 100%;")
        ])
            .SetStyle("position:relative;display:block;width: min(100%, 25em); padding-top: min(100% , 25em); background:white; border: 1px solid black; border-radius: 999em")
            .Render();
    }

    protected InnerUpdate(htmlElement: HTMLElement) {
         console.log("Inner update direction")
       super.InnerUpdate(htmlElement);
        const self = this;

        function onPosChange(x: number, y: number) {
            const rect = htmlElement.getBoundingClientRect();
            const dx = -(rect.left + rect.right) / 2 + x;
            const dy = (rect.top + rect.bottom) / 2 - y;
            const angle = 180 * Math.atan2(dy, dx) / Math.PI;
            const angleGeo = Math.floor((450 - angle) % 360);
            self.value.setData(""+angleGeo)
        }


        htmlElement.ontouchmove = (ev: TouchEvent) => {
            onPosChange(ev.touches[0].clientX, ev.touches[0].clientY);
            ev.preventDefault();
        }

        htmlElement.ontouchstart = (ev: TouchEvent) => {
            onPosChange(ev.touches[0].clientX, ev.touches[0].clientY);
            ev.preventDefault();
        }

        let isDown = false;

        htmlElement.onmousedown = (ev: MouseEvent) => {
            isDown = true;
            onPosChange(ev.x, ev.y);
            ev.preventDefault();
        }

        htmlElement.onmouseup = (ev) => {
            isDown = false; ev.preventDefault();
        }

        htmlElement.onmousemove = (ev: MouseEvent) => {
            if (isDown) {
                onPosChange(ev.x, ev.y);
            } ev.preventDefault();
        }
    }

    IsValid(str: string): boolean {
        const t = Number(str);
        return !isNaN(t) && t >= 0 && t <= 360;
    }

}