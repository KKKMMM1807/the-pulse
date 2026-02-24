import React, { useEffect, useRef } from 'react';

interface PulseWaveProps {
    bpm: number;
    color: string;
}

export const PulseWave: React.FC<PulseWaveProps> = ({ bpm, color }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let offset = 0;

        const render = () => {
            const { width, height } = canvas;
            ctx.clearRect(0, 0, width, height);
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 8;
            ctx.shadowColor = color;

            const frequency = bpm / 60;
            const amplitude = height / 4;

            for (let x = 0; x < width; x++) {
                const y = height / 2 +
                    Math.sin(x * 0.15 + offset) * amplitude;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }

            ctx.stroke();
            offset += frequency * 0.5;
            animationFrameId = window.requestAnimationFrame(render);
        };

        render();
        return () => window.cancelAnimationFrame(animationFrameId);
    }, [bpm, color]);

    return (
        <div className="mini-pulse" style={{ width: '60px', height: '30px', flexShrink: 0 }}>
            <canvas
                ref={canvasRef}
                width={60}
                height={30}
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
};
