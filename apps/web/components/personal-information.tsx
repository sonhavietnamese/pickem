'use client'

import tokenANONLogo from '@/assets/elements/token-anon.png'
import tokenUSDCLogo from '@/assets/elements/token-usdc.png'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type TooltipItem,
} from 'chart.js'
import Image from 'next/image'
import { Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
)

export default function PersonalInformation() {
  // Sample profit data over time
  const profitData = {
    labels: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ],
    datasets: [
      {
        label: 'Profit',
        data: [
          2000, 3500, 2800, 4500, 5200, 6800, 7500, 8200, 9100, 10500, 11800,
          12300,
        ],
        borderColor: '#51CB65',
        backgroundColor: (context: {
          chart: { ctx: CanvasRenderingContext2D }
        }) => {
          const ctx = context.chart.ctx
          const gradient = ctx.createLinearGradient(0, 0, 0, 200)
          gradient.addColorStop(0, 'rgba(81, 203, 101, 0.4)')
          gradient.addColorStop(1, 'rgba(81, 203, 101, 0)')
          return gradient
        },
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(27, 28, 32, 0.9)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#51CB65',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          label: function (context: TooltipItem<'line'>) {
            const value = context.parsed.y
            return value !== null ? `$${value.toLocaleString()}` : ''
          },
        },
      },
    },
    scales: {
      x: {
        display: false,
        grid: {
          display: false,
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          font: {
            size: 10,
          },
        },
      },
      y: {
        display: false,
        grid: {
          display: false,
        },
      },
    },
  }

  return (
    <section
      id="information"
      className="w-[340px] h-full bg-[#1B1C20]/70 rounded-2xl p-5"
    >
      <div className="w-full text-white grid grid-cols-[64px_1fr] gap-4 leading-none items-center">
        <div className="w-[64px] aspect-square rounded-xl bg-white"></div>
        <div className="flex flex-col ">
          <span className="text-xl font-semibold">sonhavietnamese</span>
          <span className="text-white/70 font-medium">7Jny...UsX6z</span>
        </div>
      </div>

      <div className="mt-7">
        <span className="text-white/70 font-medium text-lg">Balance</span>
        <ul className="mt-3 text-white font-medium font-sans space-y-3">
          <li className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <div className="w-[34px] aspect-square rounded-full bg-white">
                <Image
                  draggable={false}
                  src={tokenUSDCLogo}
                  alt="USDC"
                  width={34}
                  height={34}
                />
              </div>
              <span className="font-semibold text-xl text-white/80">USDC</span>
            </div>

            <div className="text-xl font-semibold">$12,300</div>
          </li>

          <li className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <div className="w-[34px] aspect-square rounded-full bg-white">
                <Image
                  draggable={false}
                  src={tokenANONLogo}
                  alt="ANON"
                  width={34}
                  height={34}
                />
              </div>
              <span className="font-semibold text-xl text-white/80">ANON</span>
            </div>

            <div className="text-xl font-semibold">$123</div>
          </li>
        </ul>
      </div>

      <div className="mt-7">
        <span className="text-white/70 font-medium text-lg">Stats</span>
        <div
          id="chart"
          className="mt-3 text-white font-medium font-sans space-y-3 h-[180px]"
        >
          <Line data={profitData} options={chartOptions} />
        </div>

        <div className="text-white grid grid-cols-[1fr_1fr] gap-3 mt-5">
          <div className="flex flex-col gap-1">
            <span className="text-white/70 font-medium flex items-center gap-1">
              Profit/Loss
              <figure className="inline-block w-3 aspect-square shrink-0">
                <svg
                  width="7"
                  height="7"
                  viewBox="0 0 7 7"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-full h-full"
                >
                  <path
                    d="M5.20423 6.08496H1.5028C0.336859 6.08496 -0.38331 4.813 0.216562 3.81322L2.06728 0.728693C2.64988 -0.242315 4.05715 -0.242315 4.63976 0.728693L6.49047 3.81322C7.09034 4.813 6.37017 6.08496 5.20423 6.08496Z"
                    fill="#51CB65"
                  />
                </svg>
              </figure>
            </span>
            <span className="text-2xl font-semibold">$12,300</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-white/70 font-medium">Biggest Win</span>
            <span className="text-2xl font-semibold">$12,300</span>
          </div>
        </div>
      </div>

      <div className="mt-7">
        <span className="text-white/70 font-medium text-lg">
          Won Markets{' '}
          <span className="px-1.5 font-semibold py-0.5 bg-white/70 text-black rounded-full text-sm">
            20
          </span>
        </span>
      </div>
    </section>
  )
}
