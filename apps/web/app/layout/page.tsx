import PersonalInformation from '@/components/personal-information'

export default function Page() {
  return (
    <main className="bg-[#020204] w-screen h-screen p-4 flex gap-3">
      <div className="w-[320px] h-full border rounded-2xl gap-3 grid grid-rows-[1fr_auto]">
        <PersonalInformation />
        <section
          id="settings"
          className="w-full h-full bg-[#1B1C20]/70 rounded-2xl p-5 leading-none"
        >
          <h3 className="text-white text-xl font-medium">Settings</h3>
          <div className="w-full py-3 text-white flex justify-between items-center pb-5">
            <div className="text-white/80 font-medium">Trade on chat</div>
            <div className="w-[40px] relative h-[24px] p-1 rounded-full bg-green-500 cursor-pointer">
              <div className="w-[16px] h-[16px] rounded-full bg-white absolute left-1 top-1/2 -translate-y-1/2"></div>
            </div>
          </div>
          <div>
            <button className="bg-white text-black px-4 py-3 rounded-md w-full">
              Sign Out
            </button>
          </div>
        </section>
      </div>
      <div className="grid grid-cols-[1fr_320px] gap-3 w-full h-full">
        <div className="w-full h-full bg-[#1B1C20]/70 rounded-2xl"></div>
        <div className="w-full h-full border rounded-2xl flex flex-col gap-3">
          <section
            id="big-wins"
            className="w-full h-full bg-[#1B1C20]/70 rounded-2xl"
          ></section>
          <section
            id="chat"
            className="w-full h-full bg-[#1B1C20]/70 rounded-2xl"
          ></section>
        </div>
      </div>
    </main>
  )
}
