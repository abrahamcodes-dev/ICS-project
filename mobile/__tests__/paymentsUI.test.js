const React=require('react'),{create,act}=require('react-test-renderer');
jest.mock('../src/services/payments',()=>({...jest.requireActual('../src/services/payments'),createPaymentSession:jest.fn()}));
const service=require('../src/services/payments'),{PatientCheckout,DoctorPayments,PaymentHistory,DemoReceipt}=require('../src/components/Payments'),{Action,Field}=require('../src/ui/design');
const pending={paymentId:'a'.repeat(64),doctorDisplay:{professionalName:'Synthetic Doctor',specialty:'Medicine'},startAt:Date.now()+86400000,endAt:Date.now()+86400000+1800000,amountMinor:150000,status:'pending',provider:'simulated-mpesa',expiresAt:Date.now()+300000,providerReference:'DEMO-only',refundReference:null,reasonCode:null,createdAt:Date.now(),demo:true};
let tree,session;beforeEach(()=>{jest.clearAllMocks();session={dispose:jest.fn(),fee:jest.fn().mockResolvedValue({amountMinor:150000,revision:1}),checkout:jest.fn().mockResolvedValue({kind:'payment',paymentId:pending.paymentId,payment:pending}),status:jest.fn().mockResolvedValue(pending),decide:jest.fn().mockResolvedValue({...pending,status:'succeeded',appointmentId:pending.paymentId}),cancel:jest.fn().mockResolvedValue({...pending,status:'cancelled'}),retryRefund:jest.fn().mockResolvedValue({...pending,status:'refund_pending'}),setFee:jest.fn().mockResolvedValue({amountMinor:0,revision:2}),history:jest.fn().mockResolvedValue({payments:[],nextCursor:null}),summary:jest.fn().mockResolvedValue({confirmed:{minor:150000,count:1},refunded:{minor:0,count:0},refundPending:{minor:0,count:0},refundFailed:{minor:0,count:0}})};service.createPaymentSession.mockReturnValue(session);});afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;jest.restoreAllMocks();});
async function mount(component){await act(async()=>{tree=create(component);});}
async function press(title){await act(async()=>tree.root.findAllByType(Action).find(x=>x.props.title===title).props.onPress());}
const checkout=()=>mount(<PatientCheckout uid="patient" doctorId="doctor" startAt={pending.startAt} confirmed={jest.fn()}/>);
test('checkout displays demo, doctor context, fee, test phone validation and no PIN control',async()=>{await checkout();expect(JSON.stringify(tree.toJSON())).toContain('DEMO PAYMENT');expect(JSON.stringify(tree.toJSON())).toContain('KSh 1,500.00');await press('Confirm demo payment');expect(session.checkout).not.toHaveBeenCalled();expect(JSON.stringify(tree.toJSON())).toContain('Enter a Kenyan test mobile');});
test('successful initiation displays pending then authoritative success',async()=>{await checkout();await act(async()=>tree.root.findByType(Field).props.onChangeText('0700000000'));await press('Confirm demo payment');expect(session.checkout.mock.calls[0][0]).toMatchObject({doctorId:'doctor',phone:'254700000000',expectedFeeRevision:1});expect(tree.root.findByType(DemoReceipt).props.payment.status).toBe('pending');session.status.mockResolvedValue({...pending,status:'succeeded',appointmentId:pending.paymentId});await press('Refresh payment status');expect(JSON.stringify(tree.toJSON())).toContain('Appointment confirmed');expect(tree.root.findAllByType(Action).map(n=>n.props.title)).not.toContain('Mark paid');});
test('unknown response retries with the identical request key',async()=>{session.checkout.mockRejectedValueOnce(Error('lost reply'));await checkout();await act(async()=>tree.root.findByType(Field).props.onChangeText('0700000000'));await press('Confirm demo payment');await press('Retry same checkout');expect(session.checkout.mock.calls[0][0]).toEqual(session.checkout.mock.calls[1][0]);});
test('explicit zero cost path needs no phone and creates no fake M-Pesa receipt',async()=>{session.fee.mockResolvedValue({amountMinor:0,revision:1});session.checkout.mockResolvedValue({kind:'free',appointmentId:'free'});await checkout();expect(tree.root.findAllByType(Field)).toHaveLength(0);await press('Confirm free appointment');expect(JSON.stringify(tree.toJSON())).toContain('Free appointment confirmed');expect(tree.root.findAllByType(DemoReceipt)).toHaveLength(0);expect(session.checkout.mock.calls[0][0].phone).toBeUndefined();});
test('unconfigured fee cannot create a booking',async()=>{session.fee.mockResolvedValue(null);await checkout();expect(JSON.stringify(tree.toJSON())).toContain('not configured');expect(tree.root.findAllByType(Action).some(n=>n.props.title==='Confirm free appointment')).toBe(false);});
test('cancel and refund retry use authorized services and render server states',async()=>{await checkout();await act(async()=>tree.root.findByType(Field).props.onChangeText('0700000000'));await press('Confirm demo payment');session.status.mockResolvedValue({...pending,status:'refund_failed'});await press('Refresh payment status');await press('Retry demo refund');expect(session.retryRefund).toHaveBeenCalledWith(pending.paymentId);expect(JSON.stringify(tree.toJSON())).toContain('not completed yet');});
test('doctor fee controls use minor units and existing revision; summary is explicitly simulated',async()=>{await mount(<DoctorPayments uid="doctor"/>);expect(JSON.stringify(tree.toJSON())).toContain('do not represent real earnings');await act(async()=>tree.root.findByType(Field).props.onChangeText('0'));await press('Save consultation fee');expect(session.setFee).toHaveBeenCalledWith(0,1);expect(JSON.stringify(tree.toJSON())).toContain('fee saved');});
test('history uses actual records and never shows an empty state beside them',async()=>{session.history.mockResolvedValue({payments:[pending],nextCursor:null});await mount(<PaymentHistory uid="patient"/>);await press('Payment history');expect(JSON.stringify(tree.toJSON())).toContain('Synthetic Doctor');expect(JSON.stringify(tree.toJSON())).not.toContain('No demo payments yet');await press('Open demo receipt aaaaaa');expect(session.status).toHaveBeenCalledWith(pending.paymentId);});
test.each(['light','dark'])('%s receipt honestly displays uncertain or refund-pending states',async mode=>{jest.spyOn(require('react-native'),'useColorScheme').mockReturnValue(mode);await mount(<DemoReceipt payment={{...pending,status:'review_required'}}/>);expect(JSON.stringify(tree.toJSON())).toContain('Do not start another payment');expect(JSON.stringify(tree.toJSON())).not.toContain('Appointment confirmed');});

async function initiate(){await checkout();await act(async()=>tree.root.findByType(Field).props.onChangeText('0700000000'));await press('Confirm demo payment');}
test('patient approves through simulator screen and navigates only after authoritative confirmation',async()=>{
 const confirmed=jest.fn();await mount(<PatientCheckout uid="patient" doctorId="doctor" startAt={pending.startAt} confirmed={confirmed}/>);
 await act(async()=>tree.root.findByType(Field).props.onChangeText('0700000000'));await press('Confirm demo payment');
 const text=JSON.stringify(tree.toJSON());expect(text).toContain('Pay CallADoc');expect(text).toContain('No real money will be deducted');
 expect(tree.root.findAllByType(Field)).toHaveLength(0);expect(confirmed).not.toHaveBeenCalled();
 await press('Approve simulated payment');expect(session.decide).toHaveBeenCalledWith(pending.paymentId,'approve');
 expect(JSON.stringify(tree.toJSON())).toContain('Appointment confirmed');await press('View confirmed appointment');expect(confirmed).toHaveBeenCalledWith(pending.paymentId);
});
test.each([['Decline simulated payment','decide','failed'],['Cancel pending demo payment','cancel','cancelled']])('%s renders backend terminal state',async(title,method,status)=>{
 session[method].mockResolvedValue({...pending,status});await initiate();await press(title);
 expect(tree.root.findByType(DemoReceipt).props.payment.status).toBe(status);expect(tree.root.findAllByType(Action).some(n=>n.props.title==='Approve simulated payment')).toBe(false);
});
test('approval locks repeated taps, shows processing and accepts no optimistic success',async()=>{
 let finish;session.decide.mockReturnValue(new Promise(resolve=>{finish=resolve;}));await initiate();
 await press('Approve simulated payment');await press('Approve simulated payment');expect(session.decide).toHaveBeenCalledTimes(1);
 expect(tree.root.findAllByType(Action).find(n=>n.props.title==='Approve simulated payment').props.disabled).toBe(true);
 expect(JSON.stringify(tree.toJSON())).not.toContain('Appointment confirmed');
 await act(async()=>finish({...pending,status:'succeeded',appointmentId:pending.paymentId}));expect(JSON.stringify(tree.toJSON())).toContain('Appointment confirmed');
});
test('uncertain approval recovers with status refresh; expired payment offers a fresh checkout',async()=>{
 session.decide.mockRejectedValue(Error('lost response'));await initiate();await press('Approve simulated payment');
 expect(JSON.stringify(tree.toJSON())).toContain('Payment status is uncertain');expect(JSON.stringify(tree.toJSON())).not.toContain('Appointment confirmed');
 session.status.mockResolvedValue({...pending,status:'expired'});await press('Refresh payment status');
 expect(tree.root.findAllByType(Action).some(n=>n.props.title==='Start a new demo checkout')).toBe(true);
});
test('restart recovery opens authoritative history and allows pending approval',async()=>{
 const confirmed=jest.fn();session.history.mockResolvedValue({payments:[pending],nextCursor:null});
 await mount(<PaymentHistory uid="patient" confirmed={confirmed}/>);await press('Payment history');await press('Open demo receipt aaaaaa');
 await press('Approve simulated payment');await press('View confirmed appointment');expect(confirmed).toHaveBeenCalledWith(pending.paymentId);
});
test('doctor history never exposes patient approval actions',async()=>{
 session.history.mockResolvedValue({payments:[pending],nextCursor:null});await mount(<PaymentHistory uid="doctor" allowCancel={false}/>);await press('Payment history');await press('Open demo receipt aaaaaa');
 expect(tree.root.findAllByType(Action).some(n=>n.props.title==='Approve simulated payment')).toBe(false);
});
